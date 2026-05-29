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

export function buildCodeRefRegex(codeDirs, codeExt) {
  const dirs = codeDirs.map((d) => d.replace(/\/$/, "")).join("|");
  const ext = codeExt.replace(".", "\\.");
  return new RegExp(`(?:${dirs})/[^\\s\`)]+\\${ext}`, "g");
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
