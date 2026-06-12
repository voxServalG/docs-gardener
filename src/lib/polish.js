import fs from "fs";
import path from "path";

const GUIDANCE_FILE = "docs/plain-writing-guidance.md";

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

  const guidancePath = path.join(projectRoot, GUIDANCE_FILE);
  const guidance = fs.existsSync(guidancePath)
    ? fs.readFileSync(guidancePath, "utf-8")
    : "";
  const content = fs.readFileSync(fullPath, "utf-8");

  return {
    ok: true,
    phase: "polish",
    next: "review",
    display: {
      title: "Polish context ready",
      body: `Loaded ${file} and the plain-writing guidance. Use the guidance to decide whether edits are needed, then show any proposed edits to the user before applying changes.`,
      files: [file],
    },
    hint: "Use the returned document, guidance, constraints, and editSchema to make model-based polish judgments. Do not invent fields. Only pass user-accepted edits to garden-apply.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-apply"],
    blockedTools: [],
    summary: {
      filesChecked: 1,
      guidanceFile: guidance ? GUIDANCE_FILE : null,
      editFields: ["file", "oldText", "newText", "reason"],
    },
    doc: {
      path: file,
      content,
    },
    guidance: {
      path: guidance ? GUIDANCE_FILE : null,
      content: guidance,
    },
    constraints: [
      "Do not modify fenced code blocks.",
      "Do not modify inline code, commands, field names, paths, API names, or error codes.",
      "Do not modify Markdown link targets.",
      "Do not add facts that are not present in the document or related project context.",
      "If a safe replacement is unclear, do not produce an edit for that passage.",
      "Every proposed edit must use exact oldText from the document.",
    ],
    editSchema: {
      type: "object",
      required: ["file", "oldText", "newText", "reason"],
      properties: {
        file: "Document path, unchanged from doc.path.",
        oldText: "Exact text to replace from doc.content.",
        newText: "Replacement text.",
        reason: "Short explanation based on the plain-writing guidance.",
      },
      additionalProperties: false,
    },
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
