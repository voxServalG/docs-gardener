import fs from "fs";
import path from "path";
import { getAllMdFiles, countLines, extractLinks } from "./utils.js";

export const SOFT_CATEGORIES = ["code-doc-consistency", "progressive-disclosure", "prose-claims"];

const CLAIM_PATTERNS = [
  { kind: "prohibition", re: /(不会|不能|禁止|not|does not|will not)/i },
  { kind: "guarantee", re: /(必然|一定|always|guarantee|ensure|must)/i },
  { kind: "precondition", re: /(必须先|需要先|only after|only when|before)/i },
];

const SURFACE_LOCATOR = {
  mcpTool: (name) => new RegExp(`server\\.tool\\s*\\(\\s*['"]${escapeRegex(name)}['"]`),
  cli: (name) => {
    const parts = name.split(/\s+/);
    const last = parts[parts.length - 1];
    return new RegExp(`case\\s+['"]${escapeRegex(last)}['"]|['"]${escapeRegex(last)}['"]\\s*:`);
  },
  configKey: (name) => new RegExp(`\\b${escapeRegex(name)}\\b\\s*[:=]`),
  catalogItem: (name) => new RegExp(escapeRegex(name)),
};

export function buildBundles(projectRoot, config, hardReport, options = {}) {
  const requested = Array.isArray(options.categories) && options.categories.length > 0
    ? options.categories
    : SOFT_CATEGORIES;
  const confidenceFloor = typeof options.confidenceFloor === "number" ? options.confidenceFloor : 0.6;

  const bundles = [];
  const rejected = [];

  if (requested.includes("code-doc-consistency")) {
    for (const bundle of buildCodeDocConsistency(projectRoot, config, hardReport)) {
      bundles.push(bundle);
    }
  }
  if (requested.includes("progressive-disclosure")) {
    const bundle = buildProgressiveDisclosure(projectRoot, config, hardReport);
    if (bundle) bundles.push(bundle);
  }
  if (requested.includes("prose-claims")) {
    for (const bundle of buildProseClaims(projectRoot, config, hardReport)) {
      bundles.push(bundle);
    }
  }

  return {
    bundles,
    rejected,
    confidenceFloor,
    findingSchema: FINDING_SCHEMA,
    constraints: CONSTRAINTS,
  };
}

function buildCodeDocConsistency(projectRoot, config, hardReport) {
  const bundles = [];
  const documented = (hardReport.coverage && hardReport.coverage.documented) || [];
  const files = hardReport.files || [];

  for (const surface of documented) {
    const docExcerpts = [];
    for (const docPath of surface.matchedDocumentationFiles || []) {
      const fileEntry = files.find((f) => f.path === docPath);
      const abs = path.join(projectRoot, docPath);
      if (!fs.existsSync(abs)) continue;
      const content = fs.readFileSync(abs, "utf-8");
      const excerpt = sliceMatchingSection(content, surface.name);
      if (!excerpt) continue;
      docExcerpts.push({
        file: docPath,
        section: excerpt.section,
        headingPath: excerpt.headingPath,
        text: excerpt.text,
        lineRange: excerpt.lineRange,
        lineCount: fileEntry ? fileEntry.lineCount : countLinesSafe(abs),
      });
    }

    const codeExcerpts = locateCodeDefinitions(projectRoot, config, surface);

    const notes = [];
    if (codeExcerpts.length === 0) {
      notes.push("code excerpt missing; report insufficient-context findings for behavior claims that cannot be verified");
    }
    if (docExcerpts.length === 0) {
      notes.push("doc excerpt missing; surface is listed as documented but no matching heading found");
    }

    bundles.push({
      id: `code-doc-consistency:${surface.name}`,
      category: "code-doc-consistency",
      surface: {
        name: surface.name,
        type: surface.type,
        source: surface.source,
      },
      docExcerpts,
      codeExcerpts,
      notes,
      rubric: [
        "Does the doc description match the code's actual behavior?",
        "Are parameter names, types, and return shapes accurate?",
        "Do described error paths or 'won't do' boundaries exist in code?",
        "Are examples reproducible with the current code?",
      ],
      allowedRules: [
        "drift-behavior",
        "drift-signature",
        "drift-boundary",
        "drift-example",
        "insufficient-context",
      ],
    });
  }

  return bundles;
}

function buildProgressiveDisclosure(projectRoot, config, hardReport) {
  const files = hardReport.files || [];
  if (files.length === 0) return null;

  const tree = files.map((file) => {
    const abs = path.join(projectRoot, file.path);
    const content = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";
    return {
      path: file.path,
      headings: extractHeadings(content),
      firstParagraph: extractFirstParagraph(content),
      incomingLinks: file.referencedBy || [],
      outgoingLinks: (file.referencesMd || []).concat(file.referencesCode || []),
      lineCount: file.lineCount,
    };
  });

  const entry = path.join(config.docsDir || "docs", "index.md").split(path.sep).join("/");

  return {
    id: "progressive-disclosure:tree",
    category: "progressive-disclosure",
    tree,
    entry,
    notes: tree.some((n) => n.path === entry)
      ? []
      : [`entry file ${entry} not found in scanned tree; report entry-lacks-overview if applicable`],
    rubric: [
      "Does the entry doc orient before it dives (audience, scope, next steps)?",
      "Does each sub-doc narrow scope rather than repeat the entry?",
      "Is there information duplication between siblings?",
      "Are there abstraction-level jumps (overview to deep-detail without transition)?",
      "Does any leaf doc surface concepts not introduced upstream?",
    ],
    allowedRules: [
      "entry-lacks-overview",
      "duplicate-info",
      "scope-jump",
      "orphan-detail",
      "dead-end",
      "insufficient-context",
    ],
  };
}

function buildProseClaims(projectRoot, config, hardReport) {
  const bundles = [];
  const files = hardReport.files || [];

  for (const file of files) {
    const abs = path.join(projectRoot, file.path);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, "utf-8");
    const claims = extractClaims(content);
    if (claims.length === 0) continue;

    bundles.push({
      id: `prose-claims:${file.path}`,
      category: "prose-claims",
      file: file.path,
      claims,
      notes: ["only compare claims against evidence in the file; do not import outside facts"],
      rubric: [
        "Is each claim verifiable against the file content or referenced surfaces?",
        "Does any claim describe behavior the code does not implement?",
        "Are absolute quantifiers (all / never / always) actually enforced?",
      ],
      allowedRules: [
        "claim-unverifiable",
        "claim-contradicted",
        "claim-overreaches",
        "insufficient-context",
      ],
    });
  }

  return bundles;
}

function sliceMatchingSection(content, needle) {
  const lines = content.split("\n");
  const headingRe = /^(#{1,6})\s+(.+?)\s*$/;
  const stack = [];
  let sectionStart = 0;
  let matchedSectionIndex = -1;
  let matchedHeadingPath = [];

  const sections = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = headingRe.exec(line);
    if (m) {
      const level = m[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, title: m[2] });
      if (sections.length > 0) {
        sections[sections.length - 1].end = i - 1;
      }
      sections.push({
        start: i,
        end: lines.length - 1,
        headingPath: stack.map((s) => s.title),
      });
      sectionStart = i;
    }
  }

  if (sections.length === 0) {
    if (content.includes(needle)) {
      return {
        section: null,
        headingPath: [],
        text: content,
        lineRange: [1, lines.length],
      };
    }
    return null;
  }

  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    const slice = lines.slice(s.start, s.end + 1).join("\n");
    if (slice.includes(needle)) {
      matchedSectionIndex = i;
      matchedHeadingPath = s.headingPath;
      break;
    }
  }

  if (matchedSectionIndex === -1) return null;

  const chosen = sections[matchedSectionIndex];
  const text = lines.slice(chosen.start, chosen.end + 1).join("\n");
  return {
    section: matchedHeadingPath[matchedHeadingPath.length - 1] || null,
    headingPath: matchedHeadingPath,
    text,
    lineRange: [chosen.start + 1, chosen.end + 1],
  };
}

function locateCodeDefinitions(projectRoot, config, surface) {
  const excerpts = [];
  const locator = SURFACE_LOCATOR[surface.type];
  if (!locator) return excerpts;
  const re = locator(surface.name);

  const candidates = collectCandidateFiles(projectRoot, config, surface);
  for (const rel of candidates) {
    const abs = path.join(projectRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, "utf-8");
    re.lastIndex = 0;
    const match = re.exec(content);
    if (!match) continue;
    const lines = content.split("\n");
    let cursor = 0;
    let lineNumber = 1;
    for (let i = 0; i < lines.length; i += 1) {
      if (cursor + lines[i].length + 1 > match.index) {
        lineNumber = i + 1;
        break;
      }
      cursor += lines[i].length + 1;
    }
    const start = Math.max(1, lineNumber - 2);
    const end = Math.min(lines.length, lineNumber + 20);
    excerpts.push({
      file: rel,
      symbol: surface.name,
      code: lines.slice(start - 1, end).join("\n"),
      lineRange: [start, end],
    });
    if (excerpts.length >= 3) break;
  }

  return excerpts;
}

function collectCandidateFiles(projectRoot, config, surface) {
  const list = new Set();
  if (surface.source) list.add(surface.source);
  const dirs = Array.isArray(config.codeDirs) ? config.codeDirs : [];
  const exts = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"];
  for (const dir of dirs) {
    const abs = path.join(projectRoot, dir);
    if (!fs.existsSync(abs)) continue;
    walkDir(abs).forEach((rel) => {
      const relFromRoot = path.relative(projectRoot, rel).split(path.sep).join("/");
      if (exts.some((ext) => relFromRoot.endsWith(ext))) {
        list.add(relFromRoot);
      }
    });
  }
  return [...list];
}

function walkDir(root, depth = 0) {
  const files = [];
  if (depth > 6 || !fs.existsSync(root)) return files;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full, depth + 1));
    } else {
      files.push(full);
    }
  }
  return files;
}

function extractHeadings(content) {
  const headings = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    headings.push({ level: m[1].length, title: m[2] });
  }
  return headings;
}

function extractFirstParagraph(content) {
  const cleaned = content.replace(/^#.*$/gm, "").trim();
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs[0] || "";
}

function extractClaims(content) {
  const claims = [];
  const lines = content.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim()) continue;
    for (const { kind, re } of CLAIM_PATTERNS) {
      if (re.test(line)) {
        claims.push({
          kind,
          text: line.trim(),
          lineRange: [i + 1, i + 1],
        });
        break;
      }
    }
  }
  return claims;
}

function countLinesSafe(abs) {
  try {
    return countLines(abs);
  } catch {
    return 0;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const FINDING_SCHEMA = {
  type: "object",
  required: ["bundleId", "rule", "severity", "confidence", "evidence", "suggestion"],
  properties: {
    bundleId: "Bundle id from data.bundles[].id",
    rule: "One of allowedRules for the bundle's category.",
    severity: "error | warning | note",
    confidence: "Number in [0, 1]; findings below confidenceFloor become warning or note.",
    evidence: {
      required: ["docCitation"],
      properties: {
        docCitation: "file:lineRange for the documentation evidence.",
        codeCitation: "file:lineRange for the code evidence when available.",
        oldText: "Exact text to replace when suggestion type is replace_text.",
        newText: "Replacement text when suggestion type is replace_text.",
      },
    },
    suggestion: {
      required: ["type", "text"],
      properties: {
        type: "manual | replace_text",
        text: "Short human-readable instruction.",
      },
    },
  },
  additionalProperties: false,
};

export const CONSTRAINTS = [
  "Only use doc and code excerpts provided in the bundle; do not import outside knowledge.",
  "Each finding must cite docCitation as file:lineRange, and codeCitation when the bundle carries code excerpts.",
  "If required evidence is missing, use rule insufficient-context instead of guessing.",
  "Findings with confidence below confidenceFloor must be reported as warning or note, not error.",
  "For replace_text suggestions, evidence.oldText must appear verbatim in the referenced document.",
];
