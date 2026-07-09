import fs from "fs";
import path from "path";
import { extractAll } from "./catalogs.js";
import { validateArchitecture } from "./architecture.js";
import { successEnvelope } from "./envelope.js";
import { buildAgentDirective } from "./agent-directive.js";
import { hashPayload, markScan, projectKey, getProject } from "./state.js";
import {
  getAllMdFiles,
  countLines,
  getLastModified,
  extractLinks,
  buildCodeRefRegex,
  findReferencingFiles,
  extractCodePathsFromMdLinks,
  extractMdLinksOnly,
} from "./utils.js";

export function scanHard(projectRoot, config) {
  const catalogs = extractAll(projectRoot, config.catalogs || {});
  const docsDir = path.join(projectRoot, config.docsDir);
  const allMdFiles = getAllMdFiles(docsDir);
  const codeRefRegex = buildCodeRefRegex(config.codeDirs, config.codeExt);

  const MAX_LINES = 200;
  const STALE_DAYS = 30;

  const files = allMdFiles.map((filePath) => {
    const relativePath = normalizePath(path.relative(projectRoot, filePath));
    const content = fs.readFileSync(filePath, "utf-8");
    const lineCount = countLines(filePath);
    const links = extractLinks(filePath);
    const referencedBy = findReferencingFiles(filePath, allMdFiles, projectRoot);
    const lastModified = getLastModified(filePath);

    const codeRefs = [];
    let m;
    codeRefRegex.lastIndex = 0;
    while ((m = codeRefRegex.exec(content)) !== null) {
      codeRefs.push(m[0]);
    }

    const codeLinks = extractCodePathsFromMdLinks(links, config.codeExt).map((target) =>
      normalizePath(path.relative(projectRoot, path.resolve(path.dirname(filePath), target)))
    );
    const mdLinks = extractMdLinksOnly(links, config.codeExt);
    const cliRefs = extractCliRefs(content);

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
        file: relativePath,
        message: `超过 ${MAX_LINES} 行限制（当前 ${lineCount} 行）`,
      });
    }

    const indexPath = normalizePath(path.join(config.docsDir, "index.md"));
    if (referencedBy.length === 0 && relativePath !== indexPath) {
      mechanicalIssues.push({
        rule: "has-reference",
        severity: "error",
        file: relativePath,
        message: "未被任何其他 md 文件引用",
      });
    }

    const daysSinceModified = (Date.now() - fs.statSync(filePath).mtime) / 86400000;
    if (daysSinceModified > STALE_DAYS) {
      mechanicalIssues.push({
        rule: "stale-time",
        severity: "warning",
        file: relativePath,
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
          file: relativePath,
          target,
          message: `链接目标不存在: [${link.text}](${target})`,
        });
      }
    }

    for (const ref of [...new Set([...codeRefs, ...codeLinks])]) {
      if (!fs.existsSync(path.join(projectRoot, ref))) {
        mechanicalIssues.push({
          rule: "dead-reference",
          severity: "error",
          file: relativePath,
          reference: ref,
          message: `引用的代码文件不存在: ${ref}`,
        });
      }
    }

    return {
      path: relativePath,
      lineCount,
      lastModified,
      referencedBy,
      referencesCode: [...new Set([...codeRefs, ...codeLinks])],
      referencesMd: mdLinks,
      mentionsCLI: cliRefs,
      mentionsCatalogs,
      mechanicalIssues,
    };
  });

  const hardErrors = [];
  const warnings = [];

  if (!fs.existsSync(docsDir)) {
    hardErrors.push({
      rule: "missing-docs-dir",
      severity: "error",
      file: config.docsDir,
      message: `配置的文档目录不存在: ${config.docsDir}`,
    });
  }

  for (const file of files) {
    for (const issue of file.mechanicalIssues) {
      if (issue.severity === "error") hardErrors.push(issue);
      if (issue.severity === "warning") warnings.push(issue);
    }
  }

  const styleIssues = collectStyleIssues(projectRoot, files);
  const coverage = collectCoverage(projectRoot, config, files);
  const architecture = validateArchitecture(projectRoot, config.docsDir, allMdFiles);
  const summary = {
    total: files.length,
    hardErrors: hardErrors.length,
    warnings: warnings.length,
    styleIssues: styleIssues.length,
    coverageUndocumented: coverage.undocumented.length,
    missingCoreRoles: architecture.missingCoreRoles.length,
  };

  const data = {
    catalogs,
    files,
    hardErrors,
    warnings,
    styleIssues,
    coverage,
    architecture,
    summary,
  };

  const hash = hashPayload({
    summary,
    hardErrors,
    warnings,
    coverage: {
      documented: coverage.documented.map((s) => s.name),
      undocumented: coverage.undocumented.map((s) => s.name),
    },
    architecture: {
      missingCoreRoles: architecture.missingCoreRoles.map((r) => r.role),
    },
    files: files.map((f) => ({ path: f.path, lineCount: f.lineCount })),
  });

  const projectRootAbs = projectKey(projectRoot);
  const previous = getProject(projectRoot).hard;
  const diff = diffHardScans(previous ? previous.envelope.data : null, data);
  const agentDirective = buildAgentDirective("hard");

  const envelope = successEnvelope({
    tool: "garden-scan-hard",
    mode: "hard",
    phase: "scan-hard",
    next: "garden-fix",
    summary,
    data: {
      ...data,
      hash,
      projectRoot: projectRootAbs,
      previousHash: previous ? previous.hash : null,
      diff,
      agentDirective,
    },
    display: {
      title: "Hard scan complete",
      body: `Scanned ${files.length} Markdown file(s): ${hardErrors.length} hard error(s), ${warnings.length} warning(s), ${styleIssues.length} style issue(s). Hash ${hash}.`,
    },
    hint: "Render this envelope per agentDirective. After rendering, call garden-fix (approved after user review) or run garden-scan-soft to add LLM review evidence.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-scan-soft", "garden-scan", "garden-fix", "garden-polish"],
  });

  const cacheOutcome = markScan(projectRoot, "hard", envelope, hash);
  if (cacheOutcome.warning) {
    envelope.warnings = envelope.warnings || [];
    envelope.warnings.push(cacheOutcome.warning);
  }

  return envelope;
}

function diffHardScans(previous, current) {
  if (!previous) {
    return { previousHash: null, changed: null, resolved: [], introduced: [] };
  }
  const prevKeys = new Set((previous.hardErrors || []).map(hardKey));
  const currKeys = new Set((current.hardErrors || []).map(hardKey));
  const introduced = [...currKeys].filter((k) => !prevKeys.has(k));
  const resolved = [...prevKeys].filter((k) => !currKeys.has(k));
  return {
    previousHash: null,
    changed: introduced.length + resolved.length,
    resolved,
    introduced,
  };
}

function hardKey(issue) {
  return `${issue.rule}|${issue.file || ""}|${issue.target || issue.reference || ""}`;
}

function collectStyleIssues(projectRoot, files) {
  const vagueTerms = ["检查", "处理", "优化", "相关", "一些"];
  const issues = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(projectRoot, file.path), "utf-8");
    const prose = stripProtectedText(content);
    for (const term of vagueTerms) {
      if (prose.includes(term)) {
        issues.push({
          rule: "vague-term",
          severity: "style",
          file: file.path,
          term,
          message: `可能存在不够具体的表达: ${term}`,
        });
      }
    }
  }
  return issues;
}

function stripProtectedText(content) {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "");
}

function collectCoverage(projectRoot, config, files) {
  const docsContent = files.map((file) => fs.readFileSync(path.join(projectRoot, file.path), "utf-8"));
  const surfaces = collectSurfaces(config);
  const documented = [];
  const undocumented = [];
  const staleMentions = [];

  for (const surface of surfaces) {
    const matchedDocumentationFiles = files
      .filter((file, index) => docsContent[index].includes(surface.name))
      .map((file) => file.path);
    const item = { ...surface, matchedDocumentationFiles };
    if (matchedDocumentationFiles.length > 0) {
      documented.push(item);
    } else {
      undocumented.push({
        ...item,
        reason: `${surface.type} surface is not mentioned by Markdown docs.`,
      });
    }
  }

  for (const file of files) {
    for (const cli of file.mentionsCLI || []) {
      if (looksLikeDocsGardenerSurface(cli) && !surfaces.some((surface) => surface.name === cli)) {
        staleMentions.push({
          surface: cli,
          surfaceType: "cli",
          documentationFile: file.path,
          reason: "Markdown mentions a docs-gardener command that is not in the detected public surface list.",
        });
      }
    }
  }

  return { documented, undocumented, staleMentions };
}

function collectSurfaces(config) {
  const surfaces = [
    ["docs-gardener scan", "cli", "src/index.js"],
    ["docs-gardener scan-hard", "cli", "src/index.js"],
    ["docs-gardener scan-soft", "cli", "src/index.js"],
    ["docs-gardener fix", "cli", "src/index.js"],
    ["docs-gardener polish", "cli", "src/index.js"],
    ["docs-gardener grow", "cli", "src/index.js"],
    ["garden-scan", "mcpTool", "src/lib/mcp-server.js"],
    ["garden-scan-hard", "mcpTool", "src/lib/mcp-server.js"],
    ["garden-scan-soft", "mcpTool", "src/lib/mcp-server.js"],
    ["garden-fix", "mcpTool", "src/lib/mcp-server.js"],
    ["garden-polish", "mcpTool", "src/lib/mcp-server.js"],
    ["garden-grow", "mcpTool", "src/lib/mcp-server.js"],
  ].map(([name, type, source]) => ({ name, type, source }));

  for (const key of ["docsDir", "codeDirs", "codeExt", "baseBranch", "catalogs"]) {
    surfaces.push({ name: key, type: "configKey", source: "src/lib/config.js" });
  }

  for (const [name, entry] of Object.entries(config.catalogs || {})) {
    if (!entry || !entry.enabled) continue;
    surfaces.push({ name, type: "catalogItem", source: entry.source || "docs-gardener.json" });
  }

  return surfaces;
}

function looksLikeDocsGardenerSurface(value) {
  return value.startsWith("docs-gardener ") || value.startsWith("garden-");
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

function normalizePath(file) {
  return file.split(path.sep).join("/");
}
