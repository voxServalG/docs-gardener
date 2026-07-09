import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fixSoft } from "../src/lib/fix-soft.js";
import { scanSoft } from "../src/lib/scan-soft.js";

test("fix-soft requires reports parameter", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  const result = fixSoft(root, config(), {});

  assert.equal(result.ok, false);
  assert.equal(result.tool, "garden-fix-soft");
  assert.equal(result.error.param, "reports");
});

test("fix-soft rejects stale hardSummaryRef", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  const result = fixSoft(root, config(), {
    hardSummaryRef: "deadbeef",
    reports: [{ bundleId: "nope", findings: [] }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.param, "hardSummaryRef");
});

test("fix-soft returns approval-required plan and rejects invalid findings", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\n它必须先安装。\n",
  });

  const soft = scanSoft(root, config()).data;
  const proseBundle = soft.bundles.find((b) => b.category === "prose-claims");
  assert.ok(proseBundle);

  const claim = proseBundle.claims[0];
  const abs = path.join(root, proseBundle.file);
  const content = fs.readFileSync(abs, "utf-8");
  const oldText = claim.text;
  assert.ok(content.includes(oldText));

  const result = fixSoft(root, config(), {
    hardSummaryRef: soft.hardSummaryRef,
    reports: [
      {
        bundleId: proseBundle.id,
        findings: [
          {
            rule: "claim-overreaches",
            severity: "warning",
            confidence: 0.8,
            evidence: {
              docCitation: `${proseBundle.file}:${claim.lineRange[0]}-${claim.lineRange[1]}`,
              oldText,
              newText: oldText.replace("必须先", "建议先"),
            },
            suggestion: {
              type: "replace_text",
              text: "把绝对量词改为建议措辞",
            },
          },
          {
            rule: "not-in-allow-list",
            severity: "error",
            confidence: 0.9,
            evidence: { docCitation: `${proseBundle.file}:1-1` },
            suggestion: { type: "manual", text: "无效 rule" },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-fix-soft");
  assert.equal(result.phase, "fix-soft-plan");
  assert.equal(result.requires_user, true);
  assert.equal(result.data.accepted.length, 1);
  assert.equal(result.data.rejected.length, 1);
  assert.equal(result.data.rejected[0].reason.startsWith("rule-not-allowed"), true);
  assert.equal(result.data.plan[0].action, "replace_text");
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
