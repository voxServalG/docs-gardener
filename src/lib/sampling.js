import { validateFinding } from "./findings-schema.js";

export function createSampler(mcpServer) {
  const inner = mcpServer && mcpServer.server ? mcpServer.server : mcpServer;
  if (!inner || typeof inner.createMessage !== "function") {
    return { available: false, reason: "no-mcp-server" };
  }

  return {
    available: true,
    async judge(bundle, projectRoot, confidenceFloor) {
      const { systemPrompt, userPrompt } = buildPrompt(bundle, confidenceFloor);
      const result = await inner.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${systemPrompt}\n\n---\n\n${userPrompt}`,
            },
          },
        ],
        maxTokens: 4096,
      });

      const text = extractText(result);
      const rawFindings = parseFindings(text);

      const accepted = [];
      const rejected = [];
      for (const raw of rawFindings) {
        const validation = validateFinding(bundle, raw, projectRoot);
        if (validation.ok) {
          accepted.push({ bundle: bundle.id, category: bundle.category, ...validation.finding });
        } else {
          rejected.push({ bundleId: bundle.id, reason: validation.reason, finding: raw });
        }
      }

      return { accepted, rejected };
    },
  };
}

export function createMockSampler(judgeFn) {
  return {
    available: true,
    async judge(bundle, projectRoot, confidenceFloor) {
      return judgeFn(bundle, projectRoot, confidenceFloor);
    },
  };
}

function buildPrompt(bundle, confidenceFloor) {
  const systemPrompt = [
    "You are a documentation quality reviewer embedded in the docs-gardener tool.",
    "You will receive a review bundle with documentation excerpts, code excerpts, and a rubric.",
    "For each issue you find, output a JSON object with these exact fields:",
    '  rule: one of the allowedRules listed below',
    '  severity: "error" | "warning" | "note"',
    "  confidence: number in [0, 1]",
    "  evidence: { docCitation: \"file:lineRange\", codeCitation?: \"file:lineRange\", oldText?: string, newText?: string }",
    '  suggestion: { type: "manual" | "replace_text", text: string }',
    "",
    `Findings with confidence below ${confidenceFloor} must be reported as warning or note, not error.`,
    "If evidence is insufficient, use rule \"insufficient-context\" with severity \"note\".",
    "Output a JSON array of findings. If no issues found, output [].",
    "Do not include explanations outside the JSON array.",
  ].join("\n");

  const userPrompt = JSON.stringify({
    bundleId: bundle.id,
    category: bundle.category,
    allowedRules: bundle.allowedRules,
    rubric: bundle.rubric,
    docExcerpts: bundle.docExcerpts || [],
    codeExcerpts: bundle.codeExcerpts || [],
    claims: bundle.claims || [],
    tree: bundle.tree || undefined,
    notes: bundle.notes || [],
  }, null, 2);

  return { systemPrompt, userPrompt };
}

function extractText(result) {
  if (!result || !result.content) return "";
  const content = result.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  }
  if (content.type === "text") return content.text || "";
  return "";
}

function parseFindings(text) {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < 0 || end <= start) return [];
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getConcurrency() {
  const raw = process.env.DOCS_GARDENER_SAMPLING_CONCURRENCY;
  const n = raw ? parseInt(raw, 10) : 4;
  return Number.isFinite(n) && n > 0 ? n : 4;
}

export async function judgeAllBundles(sampler, bundles, projectRoot, confidenceFloor) {
  if (!sampler || !sampler.available) {
    return {
      accepted: [],
      rejected: [],
      warning: "sampling-unavailable",
      durationMs: 0,
      totalBundles: bundles.length,
      succeeded: 0,
      failed: bundles.length,
    };
  }

  const concurrency = getConcurrency();
  const start = Date.now();
  const accepted = [];
  const rejected = [];
  let succeeded = 0;
  let failed = 0;

  const queue = [...bundles];
  const inFlight = [];

  async function processOne(bundle) {
    try {
      const result = await sampler.judge(bundle, projectRoot, confidenceFloor);
      accepted.push(...result.accepted);
      rejected.push(...result.rejected);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      rejected.push({
        bundleId: bundle.id,
        reason: `sampling-error:${(err && err.message) || "unknown"}`,
        finding: null,
      });
    }
  }

  while (queue.length > 0 || inFlight.length > 0) {
    while (inFlight.length < concurrency && queue.length > 0) {
      const bundle = queue.shift();
      const p = processOne(bundle);
      inFlight.push(p);
    }
    if (inFlight.length > 0) {
      await Promise.race(inFlight);
      for (let i = inFlight.length - 1; i >= 0; i -= 1) {
        try {
          await inFlight[i];
          inFlight.splice(i, 1);
        } catch {
          inFlight.splice(i, 1);
        }
      }
    }
  }

  return {
    accepted,
    rejected,
    durationMs: Date.now() - start,
    totalBundles: bundles.length,
    succeeded,
    failed,
  };
}
