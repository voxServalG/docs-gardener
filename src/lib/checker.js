import fs from "fs";
import path from "path";
import { extractAll } from "./catalogs.js";
import { buildCodeRefRegex, extractCodePathsFromMdLinks } from "./utils.js";

const MAX_CODE_FILES = 5;

export function check(projectRoot, config, file) {
  const fullPath = path.join(projectRoot, file);
  if (!fs.existsSync(fullPath)) {
    return { error: `文件不存在: ${file}` };
  }

  const docContent = fs.readFileSync(fullPath, "utf-8");
  const catalogs = extractAll(projectRoot, config.catalogs);
  const codeRefRegex = buildCodeRefRegex(config.codeDirs, config.codeExt);

  const links = [];
  const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  let lm;
  while ((lm = linkRe.exec(docContent)) !== null) {
    if (!lm[2].startsWith("http") && !lm[2].startsWith("#")) {
      links.push({ text: lm[1], target: lm[2] });
    }
  }

  const codePaths = [];
  let cm;
  while ((cm = codeRefRegex.exec(docContent)) !== null) {
    codePaths.push(cm[0]);
  }

  const codePathsFromLinks = extractCodePathsFromMdLinks(links, config.codeExt);
  const docDir = path.dirname(fullPath);
  const resolvedCodePathsFromLinks = codePathsFromLinks.map((cp) =>
    path.relative(projectRoot, path.resolve(docDir, cp))
  );

  const relatedCode = findRelatedCode(projectRoot, docContent, catalogs, config);
  const allCodePaths = [...new Set([...codePaths, ...resolvedCodePathsFromLinks])];

  for (const cp of allCodePaths) {
    const cpPath = path.join(projectRoot, cp);
    if (fs.existsSync(cpPath)) {
      if (!relatedCode.find((rc) => rc.path === cp)) {
        relatedCode.push({ path: cp, reason: `文档引用` });
      }
    }
  }

  return {
    doc: {
      path: file,
      content: docContent,
    },
    relatedCode: relatedCode.map((c) => ({
      path: c.path,
      content: readFullFile(projectRoot, c.path),
      reason: c.reason,
    })),
    catalogs,
    extractedMdLinks: links,
    extractedCodePaths: [...new Set(allCodePaths)],
  };
}

function readFullFile(projectRoot, relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
}

function findRelatedCode(projectRoot, docContent, catalogs, config) {
  const related = [];
  const added = new Set();

  function addIfExists(filePath, reason) {
    if (added.has(filePath)) return;
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) return;
    added.add(filePath);
    related.push({ path: filePath, reason });
  }

  for (const [catalogName, catalogConfig] of Object.entries(config.catalogs)) {
    if (!catalogConfig || !catalogConfig.enabled) continue;

    const items = catalogs[catalogName] || [];
    for (const item of items) {
      if (docContent.includes(item)) {
        if (catalogConfig.codeDir) {
          addIfExists(path.join(catalogConfig.codeDir, `${item}.py`), `文档提到 ${catalogName} "${item}"`);
        }
      }
    }

    if (docContent.includes(catalogName) || docContent.includes(catalogConfig.prefix)) {
      const dir = catalogConfig.codeDir;
      if (dir) {
        const interfaceFiles = ["interface.py", "package.py", "top.py"];
        for (const name of interfaceFiles) {
          addIfExists(path.join(dir, name), `${catalogName} 公共接口`);
        }
      }
    }
  }

  return related.slice(0, MAX_CODE_FILES);
}
