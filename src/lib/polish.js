import fs from "fs";
import path from "path";

const MAX_LINE_LENGTH = 50;

const REPLACEMENTS = [
  {
    from: /进行(检查|配置|修改|部署|安装|更新|删除|创建|读取|扫描|验证|提交|发布)/g,
    to: "$1",
    reason: "把名词化表达改成直接动词，降低阅读摩擦。",
  },
  {
    from: /能够/g,
    to: "能",
    reason: "使用更短、更常见的词语。",
  },
  {
    from: /应当/g,
    to: "应",
    reason: "使用更短、更直接的表达。",
  },
  {
    from: /不必要的/g,
    to: "多余的",
    reason: "使用更直接的词语。",
  },
  {
    from: /为了([^，。；]+)而/g,
    to: "为$1",
    reason: "删去可省略的连接词，让句子更短。",
  },
];

export function polish(projectRoot, config, { file }) {
  const fullPath = path.join(projectRoot, file);
  const docsRoot = path.resolve(projectRoot, config.docsDir || "docs");
  const resolved = path.resolve(fullPath);

  if (!resolved.startsWith(docsRoot + path.sep) && resolved !== docsRoot) {
    return errorEnvelope(
      `文件不在文档目录内: ${file}`,
      "Choose a Markdown file under the configured docsDir."
    );
  }

  if (!file.endsWith(".md")) {
    return errorEnvelope(
      `只支持 Markdown 文件: ${file}`,
      "Choose a .md file."
    );
  }

  if (!fs.existsSync(fullPath)) {
    return errorEnvelope(`文件不存在: ${file}`, "Check the file path and try again.");
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const { edits, findings } = analyzeMarkdown(file, content);
  const hasSuggestions = edits.length > 0 || findings.length > 0;

  return {
    ok: true,
    phase: "polish",
    next: hasSuggestions ? "review" : "done",
    display: {
      title: hasSuggestions ? "Polish suggestions ready" : "No polish suggestions",
      body: hasSuggestions
        ? `Found ${edits.length} edit suggestion(s) and ${findings.length} finding(s) in ${file}. Review them before applying changes.`
        : `No plain-writing suggestions found in ${file}.`,
      files: [file],
    },
    hint: hasSuggestions
      ? "Show the suggestions to the user. Only pass accepted edits to garden-apply."
      : "No follow-up tool is needed.",
    requires_user: hasSuggestions,
    stop_here: hasSuggestions,
    allowedTools: hasSuggestions ? ["garden-apply"] : [],
    blockedTools: [],
    summary: {
      filesChecked: 1,
      edits: edits.length,
      findings: findings.length,
    },
    edits,
    findings,
  };
}

function analyzeMarkdown(file, content) {
  const edits = [];
  const findings = [];
  const lines = content.split("\n");
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }

    if (inFence || !trimmed || trimmed.startsWith("#")) continue;

    if (line.length > MAX_LINE_LENGTH) {
      findings.push({
        file,
        line: index + 1,
        text: line,
        reason: "句子或段落较长，可能需要拆短或改成列表。",
      });
    }

    if (!isSafeForEdit(line)) continue;

    const suggestion = suggestLineEdit(line);
    if (suggestion) {
      edits.push({
        file,
        oldText: line,
        newText: suggestion.text,
        reason: suggestion.reason,
      });
    }
  }

  return { edits, findings };
}

function isSafeForEdit(line) {
  return !line.includes("`") && !/\[[^\]]+\]\([^)]+\)/.test(line);
}

function suggestLineEdit(line) {
  let next = line;
  const reasons = [];

  for (const replacement of REPLACEMENTS) {
    const updated = next.replace(replacement.from, replacement.to);
    if (updated !== next) {
      next = updated;
      reasons.push(replacement.reason);
    }
  }

  if (next === line) return null;
  return {
    text: next,
    reason: [...new Set(reasons)].join(" "),
  };
}

function errorEnvelope(message, instruction) {
  return {
    ok: false,
    phase: "polish",
    next: "polish",
    display: {
      title: "Polish failed",
      body: message,
    },
    hint: instruction,
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-polish"],
    blockedTools: ["garden-apply"],
    recovery: {
      tool: "garden-polish",
      instruction,
    },
    error: {
      message,
      recovery: instruction,
    },
  };
}
