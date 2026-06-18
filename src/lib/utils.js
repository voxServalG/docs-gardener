import fs from "fs";
import path from "path";

export function getAllMdFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllMdFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

export function countLines(filePath) {
  return fs.readFileSync(filePath, "utf-8").split("\n").length;
}

export function getLastModified(filePath) {
  return fs.statSync(filePath).mtime.toISOString().split("T")[0];
}

export function extractLinks(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const links = [];
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    links.push({ text: m[1], target: m[2] });
  }
  return links;
}

export function buildCodeRefRegex(codeDirs = [], codeExt = ".py") {
  const dirs = codeDirs.map((d) => escapeRegex(d.replace(/\/$/, ""))).join("|");
  const exts = (Array.isArray(codeExt) ? codeExt : [codeExt]).map((ext) => escapeRegex(ext));
  if (!dirs || exts.length === 0) return /$a/g;
  return new RegExp(`(?:${dirs})/[^\\s\`)]+(?:${exts.join("|")})`, "g");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractCodePathsFromMdLinks(links, codeExt) {
  const exts = Array.isArray(codeExt) ? codeExt : [codeExt];
  return links
    .filter((l) => !l.target.startsWith("http") && !l.target.startsWith("#"))
    .filter((l) => exts.some((ext) => l.target.endsWith(ext)))
    .map((l) => l.target);
}

export function extractMdLinksOnly(links, codeExt) {
  const exts = Array.isArray(codeExt) ? codeExt : [codeExt];
  return links
    .filter((l) => !l.target.startsWith("http") && !l.target.startsWith("#"))
    .filter((l) => !exts.some((ext) => l.target.endsWith(ext)))
    .map((l) => l.target);
}

export function findReferencingFiles(filePath, allFiles, projectRoot) {
  const relativePath = path.relative(projectRoot, filePath);
  const fileName = path.basename(filePath);
  const refs = [];
  for (const f of allFiles) {
    if (f === filePath) continue;
    const content = fs.readFileSync(f, "utf-8");
    if (content.includes(relativePath) || content.includes(fileName)) {
      refs.push(path.relative(projectRoot, f));
    }
  }
  return refs;
}
