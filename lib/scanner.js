import fs from "fs";
import path from "path";
import { extractAll } from "./catalogs.js";
import {
  getAllMdFiles,
  countLines,
  getLastModified,
  extractLinks,
  buildCodeRefRegex,
  findReferencingFiles,
} from "./utils.js";

export function scan(projectRoot, config) {
  const catalogs = extractAll(projectRoot, config.catalogs);
  const docsDir = path.join(projectRoot, config.docsDir);
  const allMdFiles = getAllMdFiles(docsDir);
  const codeRefRegex = buildCodeRefRegex(config.codeDirs, config.codeExt);

  const MAX_LINES = 200;
  const STALE_DAYS = 30;

  const allCatalogNames = new Set();
  for (const items of Object.values(catalogs)) {
    for (const item of items) {
      allCatalogNames.add(item);
    }
  }

  const files = allMdFiles.map((filePath) => {
    const relativePath = path.relative(projectRoot, filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const lineCount = countLines(filePath);
    const links = extractLinks(filePath);
    const referencedBy = findReferencingFiles(filePath, allMdFiles, projectRoot);
    const lastModified = getLastModified(filePath);

    const codeRefs = [];
    let m;
    while ((m = codeRefRegex.exec(content)) !== null) {
      codeRefs.push(m[0]);
    }

    const cliRefs = extractCliRefs(content);
    const mdLinks = links
      .filter((l) => !l.target.startsWith("http") && !l.target.startsWith("#"))
      .map((l) => l.target);

    const mentionsCatalogs = {};
    for (const [name, items] of Object.entries(catalogs)) {
      const mentioned = items.filter((item) => content.includes(item));
      if (mentioned.length > 0) {
        mentionsCatalogs[name] = mentioned;
      }
    }

    const mechanicalIssues = [];

    if (lineCount > MAX_LINES) {
      mechanicalIssues.push({
        rule: "line-limit",
        severity: "error",
        message: `超过 ${MAX_LINES} 行限制（当前 ${lineCount} 行）`,
      });
    }

    if (referencedBy.length === 0) {
      mechanicalIssues.push({
        rule: "has-reference",
        severity: "error",
        message: "未被任何其他 md 文件引用",
      });
    }

    const daysSinceModified = (Date.now() - fs.statSync(filePath).mtime) / 86400000;
    if (daysSinceModified > STALE_DAYS) {
      mechanicalIssues.push({
        rule: "stale-time",
        severity: "warning",
        message: `超过 ${STALE_DAYS} 天未更新（最后修改: ${lastModified}）`,
      });
    }

    for (const link of links) {
      const target = link.target;
      if (target.startsWith("http") || target.startsWith("#")) continue;
      const resolved = path.resolve(path.dirname(filePath), target);
      if (!fs.existsSync(resolved)) {
        mechanicalIssues.push({
          rule: "dead-link",
          severity: "error",
          message: `链接目标不存在: [${link.text}](${target})`,
        });
      }
    }

    for (const ref of [...new Set(codeRefs)]) {
      if (!fs.existsSync(path.join(projectRoot, ref))) {
        mechanicalIssues.push({
          rule: "dead-reference",
          severity: "error",
          message: `引用的代码文件不存在: ${ref}`,
        });
      }
    }

    return {
      path: relativePath,
      lineCount,
      lastModified,
      referencedBy,
      referencesCode: [...new Set(codeRefs)],
      referencesMd: mdLinks,
      mentionsCLI: cliRefs,
      mentionsCatalogs,
      mechanicalIssues,
    };
  });

  return {
    catalogs,
    files,
    summary: {
      total: files.length,
      withMechanicalIssues: files.filter((f) => f.mechanicalIssues.length > 0).length,
    },
  };
}

function extractCliRefs(content) {
  const refs = [];
  const re = /`([a-z][\w-]*(?:\s+[\w-]+)*)`/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    refs.push(m[1]);
  }
  return [...new Set(refs)];
}
