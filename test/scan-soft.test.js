import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanHard } from "../src/lib/scan-hard.js";
import { scanSoft } from "../src/lib/scan-soft.js";
import { resetMemoryFallback } from "../src/lib/state.js";
import { createMockSampler } from "../src/lib/sampling.js";

test("scan-soft with mock sampler returns findings in envelope", async () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n本工具不会修改文件。\n",
    "src/lib/mcp-server.js": "server.tool(\"garden-scan-hard\", desc, {}, handler)\n",
  });

  scanHard(root, config());
  const mockSampler = createMockSampler(async (bundle, projectRoot, confidenceFloor) => {
    if (bundle.category === "prose-claims" && bundle.claims.length > 0) {
      const claim = bundle.claims[0];
      const abs = path.join(projectRoot, bundle.file);
      const content = fs.readFileSync(abs, "utf-8");
      if (!content.includes(claim.text)) return { accepted: [], rejected: [] };
      return {
        accepted: [{
          bundle: bundle.id,
          category: bundle.category,
          rule: "claim-overreaches",
          severity: "warning",
          confidence: 0.8,
          evidence: {
            docCitation: `${bundle.file}:${claim.lineRange[0]}-${claim.lineRange[1]}`,
            oldText: claim.text,
            newText: claim.text.replace("不会", "通常不会"),
          },
          suggestion: { type: "replace_text", text: "把绝对量词改为建议措辞" },
        }],
        rejected: [],
      };
    }
    return { accepted: [], rejected: [] };
  });

  const result = await scanSoft(root, config(), {}, mockSampler);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.equal(result.mode, "soft");
  assert.equal(result.next, "garden-fix");
  assert.ok(Array.isArray(result.data.findings));
  assert.ok(result.data.findings.length > 0);
  assert.equal(result.data.bundles, undefined);
  assert.ok(result.data.agentDirective);
  assert.equal(result.data.agentDirective.renderRequired, true);
  assert.ok(result.data.agentDirective.forbiddenTerms);
  assert.ok(result.data.agentDirective.forbiddenTerms.includes("bundle"));
  assert.ok(result.data.agentDirective.userRenderTemplate);
});

test("scan-soft without sampler returns empty findings and warning", async () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  scanHard(root, config());
  const result = await scanSoft(root, config(), {}, null);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.ok(Array.isArray(result.data.findings));
  assert.equal(result.data.findings.length, 0);
  assert.ok(result.warnings);
  assert.ok(result.warnings.some((w) => w.includes("sampling-unavailable")));
  assert.equal(result.data.bundles, undefined);
});

test("scan-soft respects categories filter", async () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n概述内容。\n",
  });

  scanHard(root, config());
  const result = await scanSoft(root, config(), { categories: ["progressive-disclosure"] }, null);

  assert.equal(result.data.findings.length, 0);
  assert.equal(result.summary.sampling.totalBundles, 1);
});

function config() {
  return {
    docsDir: "docs",
    codeDirs: ["src"],
    codeExt: ".ts",
    baseBranch: "main",
    catalogs: {},
  };
}

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

function isolateState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-state-"));
  process.env.DOCS_GARDENER_STATE_DIR = dir;
  resetMemoryFallback();
}
