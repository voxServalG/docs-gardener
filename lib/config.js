import fs from "fs";
import path from "path";

const DEFAULTS = {
  docsDir: "docs",
  codeDirs: ["src"],
  codeExt: ".py",
  baseBranch: "main",
  catalogs: {},
};

export function load(projectRoot) {
  const configPath = path.join(projectRoot, "docs-gardener.json");
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULTS, projectRoot };
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    projectRoot,
    docsDir: raw.docsDir || DEFAULTS.docsDir,
    codeDirs: raw.codeDirs || DEFAULTS.codeDirs,
    codeExt: raw.codeExt || DEFAULTS.codeExt,
    baseBranch: raw.baseBranch || DEFAULTS.baseBranch,
    catalogs: raw.catalogs || DEFAULTS.catalogs,
  };
}

export function save(projectRoot, config) {
  const { projectRoot: _, ...toSave } = config;
  const configPath = path.join(projectRoot, "docs-gardener.json");
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2) + "\n");
}

export function validate(config) {
  const errors = [];

  if (!config.docsDir || typeof config.docsDir !== "string") {
    errors.push("文档目录不能为空");
  }
  if (!Array.isArray(config.codeDirs) || config.codeDirs.length === 0) {
    errors.push("代码目录不能为空");
  }
  if (!config.codeExt || !config.codeExt.startsWith(".")) {
    errors.push("代码后缀必须以 . 开头");
  }
  if (!config.baseBranch || typeof config.baseBranch !== "string") {
    errors.push("基础分支不能为空");
  }

  return errors;
}
