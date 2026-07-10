import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMockSampler, judgeAllBundles } from "../src/lib/sampling.js";
import { buildBundles, SOFT_CATEGORIES } from "../src/lib/soft-bundles.js";
import { resetMemoryFallback } from "../src/lib/state.js";

test("judgeAllBundles returns empty when sampler is unavailable", async () => {
  const result = await judgeAllBundles(null, [], "/tmp", 0.6);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.warning, "sampling-unavailable");
});

test("mock sampler produces accepted findings that pass schema", async () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n本工具不会修改文件。\n",
    "src/lib/mcp-server.js": "server.tool(\"garden-scan-hard\", desc, {}, handler)\n",
  });
  const config = { docsDir: "docs", codeDirs: ["src"], codeExt: ".ts", baseBranch: "main", catalogs: {} };
  const hardReport = {
    hardErrors: [],
    files: [{ path: "docs/index.md", lineCount: 3, referencedBy: [], referencesCode: [], referencesMd: [], mentionsCLI: [], mentionsCatalogs: {}, mechanicalIssues: [] }],
    coverage: { documented: [], undocumented: [], staleMentions: [] },
    summary: {},
  };
  const { bundles } = buildBundles(root, config, hardReport, { categories: SOFT_CATEGORIES, confidenceFloor: 0.6 });

  const mockSampler = createMockSampler(async (bundle) => {
    if (bundle.category === "prose-claims" && bundle.claims.length > 0) {
      const claim = bundle.claims[0];
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

  const result = await judgeAllBundles(mockSampler, bundles, root, 0.6);
  assert.ok(result.accepted.length >= 1);
  assert.equal(result.succeeded, bundles.length);
  assert.equal(result.failed, 0);
});

test("mock sampler with invalid finding goes to rejected", async () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });
  const config = { docsDir: "docs", codeDirs: ["src"], codeExt: ".ts", baseBranch: "main", catalogs: {} };
  const hardReport = { hardErrors: [], files: [{ path: "docs/index.md", lineCount: 2, referencedBy: [], referencesCode: [], referencesMd: [], mentionsCLI: [], mentionsCatalogs: {}, mechanicalIssues: [] }], coverage: { documented: [], undocumented: [], staleMentions: [] }, summary: {} };
  const { bundles } = buildBundles(root, config, hardReport, { categories: ["progressive-disclosure"], confidenceFloor: 0.6 });

  const mockSampler = createMockSampler(async (bundle) => {
    return {
      accepted: [],
      rejected: [],
    };
  });

  const result = await judgeAllBundles(mockSampler, bundles, root, 0.6);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.succeeded, bundles.length);
});

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
