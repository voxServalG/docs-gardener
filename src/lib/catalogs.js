import fs from "fs";
import path from "path";

export function extractAll(projectRoot, catalogs) {
  const result = {};
  for (const [name, entry] of Object.entries(catalogs)) {
    if (!entry || !entry.enabled) continue;
    result[name] = extractCatalog(projectRoot, name, entry);
  }
  return result;
}

function extractCatalog(projectRoot, name, entry) {
  const sourcePath = path.join(projectRoot, entry.source);
  if (!fs.existsSync(sourcePath)) return [];

  try {
    if (entry.strategy === "dict") {
      return extractDictKeys(sourcePath, entry.funcName);
    }
    if (entry.strategy === "argparse") {
      return extractArgparseCommands(sourcePath, entry.prefix);
    }
  } catch {
    // parsing failed, return empty
  }

  return [];
}

function extractDictKeys(filePath, funcName) {
  const src = fs.readFileSync(filePath, "utf-8");
  const re = new RegExp(`def ${funcName}\\(\\)[^{]*\\{([^}]+)\\}`, "s");
  const m = src.match(re);
  if (!m) return [];
  const keys = [];
  const keyRe = /"([^"]+)"/g;
  let km;
  while ((km = keyRe.exec(m[1])) !== null) {
    keys.push(km[1]);
  }
  return keys;
}

function extractArgparseCommands(filePath, prefix) {
  const src = fs.readFileSync(filePath, "utf-8");
  const collapsed = src.replace(/\n\s+/g, " ").replace(/\s+/g, " ");

  const parentMap = {};
  const m1 = /(\w+)_sub\s*=\s*(\w+)\.add_subparsers\s*\(/g;
  let m;
  while ((m = m1.exec(collapsed)) !== null) {
    parentMap[m[1]] = m[2];
  }

  const croots = {};
  const m2 = /\bsub\.add_parser\s*\(\s*"([^"]+)"\s*,/g;
  while ((m = m2.exec(collapsed)) !== null) {
    croots[m[1]] = true;
  }

  const commands = [];
  const m3 = /(\w+)_sub\.add_parser\s*\(\s*"([^"]+)"\s*,/g;
  while ((m = m3.exec(collapsed)) !== null) {
    const subGroup = m[1];
    const cmdName = m[2];
    const parent = parentMap[subGroup];
    if (parent && croots[parent]) {
      commands.push(`${prefix} ${parent} ${cmdName}`);
    }
  }

  for (const name of Object.keys(croots)) {
    commands.push(`${prefix} ${name}`);
  }

  return [...new Set(commands)].sort();
}

export function detectCatalogs(projectRoot, codeExt) {
  const found = {};

  if (codeExt !== ".py") return found;

  function searchDir(dir, maxDepth = 3, depth = 0) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && !["node_modules", "__pycache__", "tests"].includes(entry.name)) {
          searchDir(full, maxDepth, depth + 1);
        } else if (entry.name.endsWith(".py")) {
          scanFile(full, dir);
        }
      }
    } catch {
      // skip
    }
  }

  function scanFile(filePath, parentDir) {
    try {
      const src = fs.readFileSync(filePath, "utf-8");
      const fileName = path.basename(filePath);

      if (fileName === "parse.py") {
        const cliMatch = src.match(/(\w+)_sub\.add_parser\s*\(\s*"(\w+)"/);
        if (cliMatch) {
          found.cli = {
            enabled: true,
            source: path.relative(projectRoot, filePath),
            strategy: "argparse",
            prefix: cliMatch[1],
          };
        }
      }

      const funcMatch = src.match(/def\s+(build_\w+_catalog)\s*\(/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const name = funcName
          .replace("build_", "")
          .replace("_catalog", "");

        if (name && !["cli", "signal", "strategy", "policy"].includes(name)) {
          const dirName = path.basename(parentDir);
          const relativeSource = path.relative(projectRoot, filePath);
          const codeDir = path.relative(projectRoot, parentDir);

          found[name] = {
            enabled: true,
            source: relativeSource,
            strategy: "dict",
            funcName,
            codeDir,
          };
        }
      }
    } catch {
      // skip
    }
  }

  const srcDir = path.join(projectRoot, "src");
  if (fs.existsSync(srcDir)) {
    searchDir(srcDir);
  }

  return found;
}
