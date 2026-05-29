import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { detectCatalogs } from "../lib/catalogs.js";

export function detect(projectRoot) {
  return {
    docsDir: detectDocsDir(projectRoot),
    codeDirs: detectCodeDirs(projectRoot),
    codeExt: detectCodeExt(projectRoot),
    baseBranch: detectBaseBranch(projectRoot),
    catalogs: detectCatalogs(projectRoot, detectCodeExtSimple(projectRoot)),
  };
}

function detectDocsDir(root) {
  const candidates = ["docs", "doc", "documentation"];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const mdCount = countMdFiles(p);
      return { path: name, mdCount };
    }
  }
  return null;
}

function countMdFiles(dir) {
  let count = 0;
  function walk(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".md")) count++;
      }
    } catch {}
  }
  walk(dir);
  return count;
}

function detectCodeDirs(root) {
  const candidates = ["src", "lib", "app", "pkg", "source"];
  const found = [];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const count = countCodeFiles(p);
      if (count > 0) found.push({ name, fileCount: count });
    }
  }
  const tests = path.join(root, "tests");
  if (fs.existsSync(tests) && fs.statSync(tests).isDirectory()) {
    found.push({ name: "tests", fileCount: countCodeFiles(tests) });
  }
  return found;
}

function countCodeFiles(dir) {
  let count = 0;
  function walk(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "__pycache__") {
          walk(full);
        } else if (entry.isFile() && !entry.name.startsWith(".")) {
          count++;
        }
      }
    } catch {}
  }
  walk(dir);
  return count;
}

function detectCodeExt(root) {
  const dirs = detectCodeDirs(root);
  const extCount = {};
  function walk(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "__pycache__") {
          walk(full);
        } else if (entry.isFile() && !entry.name.startsWith(".")) {
          const ext = path.extname(entry.name);
          if (ext) extCount[ext] = (extCount[ext] || 0) + 1;
        }
      }
    } catch {}
  }
  for (const d of dirs) walk(path.join(root, d.name));
  const entries = Object.entries(extCount).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e[1], 0);
  return {
    primary: entries[0][0],
    primaryRatio: Math.round((entries[0][1] / total) * 100),
    others: entries.slice(1, 5).map(([ext, count]) => ({ ext, count, ratio: Math.round((count / total) * 100) })),
  };
}

function detectCodeExtSimple(root) {
  const result = detectCodeExt(root);
  return result ? result.primary : ".py";
}

function detectBaseBranch(root) {
  try {
    const branch = execSync("git branch --show-current", { cwd: root, encoding: "utf-8" }).trim();
    if (branch) return branch;
  } catch {}
  return null;
}
