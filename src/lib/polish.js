import fs from "fs";
import path from "path";
import { successEnvelope, errorEnvelope } from "./envelope.js";

const GUIDANCE_FILE = "docs/plain-writing-guidance.md";

export function polish(projectRoot, config, { file } = {}) {
  if (!file) {
    return errorEnvelope({
      tool: "garden-polish",
      mode: "soft",
      phase: "polish",
      param: "file",
      message: "缺少必填参数: file",
      hint: "Pass a Markdown file under the configured docsDir.",
      allowedTools: ["garden-polish"],
    });
  }

  const fullPath = path.join(projectRoot, file);
  const docsRoot = path.resolve(projectRoot, config.docsDir || "docs");
  const resolved = path.resolve(fullPath);

  if (!resolved.startsWith(docsRoot + path.sep) && resolved !== docsRoot) {
    return errorEnvelope({
      tool: "garden-polish",
      mode: "soft",
      phase: "polish",
      param: "file",
      message: `文件不在文档目录内: ${file}`,
      hint: "Choose a Markdown file under the configured docsDir.",
      allowedTools: ["garden-polish"],
    });
  }

  if (!file.endsWith(".md")) {
    return errorEnvelope({
      tool: "garden-polish",
      mode: "soft",
      phase: "polish",
      param: "file",
      message: `只支持 Markdown 文件: ${file}`,
      hint: "Choose a .md file.",
      allowedTools: ["garden-polish"],
    });
  }

  if (!fs.existsSync(fullPath)) {
    return errorEnvelope({
      tool: "garden-polish",
      mode: "soft",
      phase: "polish",
      param: "file",
      message: `文件不存在: ${file}`,
      hint: "Check the file path and try again.",
      allowedTools: ["garden-polish"],
    });
  }

  const guidancePath = path.join(projectRoot, GUIDANCE_FILE);
  const guidance = fs.existsSync(guidancePath)
    ? fs.readFileSync(guidancePath, "utf-8")
    : "";
  const content = fs.readFileSync(fullPath, "utf-8");
  const data = {
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

  return {
    ...successEnvelope({
      tool: "garden-polish",
      mode: "soft",
      phase: "polish",
      next: "review",
      summary: {
        filesChecked: 1,
        guidanceFile: guidance ? GUIDANCE_FILE : null,
        editFields: ["file", "oldText", "newText", "reason"],
      },
      data,
      display: {
        title: "Polish context ready",
        body: `Loaded ${file} and the plain-writing guidance. Use the guidance to decide whether edits are needed, then show any proposed edits to the user before applying changes.`,
        files: [file],
      },
      hint: "Use the returned document, guidance, constraints, and editSchema to make model-based polish judgments. Do not invent fields. Apply only user-accepted edits through the calling workflow.",
      requires_user: true,
      stop_here: true,
      allowedTools: [],
    }),
    ...data,
  };
}
