import fs from "fs";
import path from "path";
import { DEFAULT_ARCHITECTURE, validateArchitecture } from "./architecture.js";
import { getAllMdFiles } from "./utils.js";
import { successEnvelope } from "./envelope.js";

export function grow(projectRoot, config) {
  const docsDir = config.docsDir || "docs";
  const docsRoot = path.join(projectRoot, docsDir);
  const mdFiles = getAllMdFiles(docsRoot);
  const available = !fs.existsSync(docsRoot) || mdFiles.length === 0;
  const context = inspectProject(projectRoot, config, docsRoot, mdFiles);

  if (!available) {
    return successEnvelope({
      tool: "garden-grow",
      mode: "bridge",
      phase: "grow",
      next: "garden-scan-hard",
      summary: {
        available: false,
        markdownFiles: mdFiles.length,
      },
      data: {
        available: false,
        reason: `${docsDir} already contains Markdown files.`,
        context,
      },
      display: {
        title: "Grow unavailable",
        body: `${docsDir} already contains ${mdFiles.length} Markdown file(s).`,
      },
      hint: "Use garden-scan-hard for existing documentation systems.",
      allowedTools: ["garden-scan-hard"],
    });
  }

  const architecture = DEFAULT_ARCHITECTURE.map((role) => ({
    ...role,
    path: role.path.replace(/^docs\//, `${docsDir}/`),
  }));

  return successEnvelope({
    tool: "garden-grow",
    mode: "bridge",
    phase: "grow",
    next: "garden-scan-hard",
    summary: {
      available: true,
      suggestedFiles: architecture.length,
    },
    data: {
      available: true,
      context,
      architecture,
      suggestedFiles: architecture.map((role) => ({
        path: role.path,
        role: role.role,
        purpose: role.purpose,
        why: role.core
          ? "Core role in the default documentation architecture."
          : "Recommended role for a fuller documentation system.",
        guidance: `Draft ${role.path} for the ${role.role} role. Use TODO markers for unknown facts.`,
      })),
      agentContract: [
        "Do not invent project facts.",
        "Use TODO markers for unknown facts.",
        "Do not overwrite existing Markdown.",
        "Prefer the architecture reference preferred paths unless the user asks otherwise.",
        "Keep each document focused on one main role.",
        "Ensure index.md links to generated documents if files are created.",
      ],
      validation: {
        method: "validateArchitecture(projectRoot, docsDir, files)",
        exampleOutput: validateArchitecture(projectRoot, docsDir, mdFiles),
      },
    },
    display: {
      title: "Grow package ready",
      body: `${docsDir} is empty or missing. garden-grow returned a bootstrap package without writing files.`,
    },
    hint: "Use this payload as planning context. Actual writing, approval, verification, commit, and PR lifecycle belong to the calling workflow.",
    allowedTools: ["garden-scan-hard"],
  });
}

function inspectProject(projectRoot, config, docsRoot, mdFiles) {
  const packagePath = path.join(projectRoot, "package.json");
  const pyprojectPath = path.join(projectRoot, "pyproject.toml");
  const readmePath = path.join(projectRoot, "README.md");

  return {
    docsDir: config.docsDir || "docs",
    docsDirExists: fs.existsSync(docsRoot),
    markdownFiles: mdFiles.map((file) => path.relative(projectRoot, file)),
    readme: fs.existsSync(readmePath) ? "README.md" : null,
    packageJson: fs.existsSync(packagePath) ? "package.json" : null,
    pyproject: fs.existsSync(pyprojectPath) ? "pyproject.toml" : null,
    likelySourceDirs: (config.codeDirs || []).filter((dir) => fs.existsSync(path.join(projectRoot, dir))),
    likelyTestDirs: ["test", "tests"].filter((dir) => fs.existsSync(path.join(projectRoot, dir))),
    configPath: fs.existsSync(path.join(projectRoot, "docs-gardener.json")) ? "docs-gardener.json" : null,
  };
}
