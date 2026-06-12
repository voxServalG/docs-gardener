import fs from "fs";
import path from "path";
import readline from "readline";
import { detect } from "./detect.js";
import { validate } from "../lib/config.js";

const existing = {};

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(question) {
  return new Promise((resolve) => {
    const iface = rl();
    iface.question(question, (answer) => {
      iface.close();
      resolve(answer.trim());
    });
  });
}

export async function run(projectRoot) {
  console.log("\n  docs-gardener · MCP 文档语义审查工具");
  console.log("  " + "═".repeat(35) + "\n");

  const configPath = path.join(projectRoot, "docs-gardener.json");
  const hasExisting = fs.existsSync(configPath);
  if (hasExisting) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      Object.assign(existing, raw);
      console.log("  检测到已有配置，将以现有值作为默认值\n");
    } catch {
      console.log("  已有配置文件无法读取，将重新配置\n");
    }
  }

  const detected = detect(projectRoot);

  const cfg = {
    docsDir: existing.docsDir || (detected.docsDir ? detected.docsDir.path : "docs"),
    codeDirs: existing.codeDirs || (detected.codeDirs.length > 0 ? detected.codeDirs.map((d) => d.name) : ["src"]),
    codeExt: existing.codeExt || (detected.codeExt ? detected.codeExt.primary : ".py"),
    baseBranch: existing.baseBranch || detected.baseBranch || "main",
    catalogs: existing.catalogs || detected.catalogs || {},
  };

  const detectedInfo = { ...detected };

  while (true) {
    printChecklist(cfg, detectedInfo);
    const choice = await ask("  输入编号修改，输入 0 完成\n  > ");

    if (choice === "0") break;

    switch (choice) {
      case "1":
        await editDocsDir(cfg, detectedInfo);
        break;
      case "2":
        await editCodeDirs(cfg, detectedInfo);
        break;
      case "3":
        await editCodeExt(cfg, detectedInfo);
        break;
      case "4":
        await editBaseBranch(cfg, detectedInfo);
        break;
      case "5":
        await editCatalogs(projectRoot, cfg, detectedInfo);
        break;
      default:
        console.log("  无效选择，请输入 1-5 或 0");
    }
    console.log("");
  }

  const errors = validate(cfg);
  if (errors.length > 0) {
    console.log("  ✗ 配置校验失败:");
    for (const err of errors) {
      console.log(`    - ${err}`);
    }
    return;
  }

  console.log("\n  即将写入以下文件：\n");
  console.log("  • docs-gardener.json");
  console.log("");

  const mcpSnippet = JSON.stringify(
    {
      mcp: {
        "docs-gardener": {
          type: "local",
          command: ["docs-gardener", "mcp"],
          enabled: true,
        },
      },
    },
    null,
    2
  );

  console.log("  ═══════════════════════════════════════════");
  console.log("  请在 opencode.json 中手动添加以下 MCP 配置：\n");
  console.log("  " + mcpSnippet.split("\n").join("\n  "));
  console.log("  ═══════════════════════════════════════════");

  const confirm = await ask("\n  确认写入 docs-gardener.json？[Y/n] ");
  if (confirm && confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
    console.log("\n  已取消，未写入任何文件\n");
    return;
  }

  const configModule = await import("../lib/config.js");
  configModule.save(projectRoot, cfg);
  console.log("\n  ✓  docs-gardener.json  已写入");

  console.log("\n  下一步：");
  console.log("    git add docs-gardener.json");
  console.log("    手动更新 opencode.json（按上方提示）");
  console.log("    docs-gardener mcp   测试 MCP server\n");
}

function printChecklist(cfg, detected) {
  const catalogEnabled = Object.values(cfg.catalogs || {}).filter((c) => c && c.enabled).length;
  const catalogTotal = Object.keys(cfg.catalogs || {}).length;
  const catalogStr = catalogTotal > 0
    ? `${catalogEnabled} 个已启用`
    : "未配置";

  console.log("  ┌──────────────────────────────────────────────────────┐");
  printSimpleItem("1", "文档目录", cfg.docsDir,
    detected.docsDir ? `包含 ${detected.docsDir.mdCount} 个 .md 文件` : "未检测到",
    "扫描此目录下所有 .md 文件");

  const dirsDetail = detected.codeDirs.length > 0
    ? detected.codeDirs.map((d) => `${d.name} (${d.fileCount} 个文件)`).join(", ")
    : "未检测到";
  printSimpleItem("2", "代码目录", cfg.codeDirs.join(", "), dirsDetail,
    "检查文档引用的代码路径是否存活");

  const extDetail = detected.codeExt
    ? `${detected.codeExt.primary}（占 ${detected.codeExt.primaryRatio}%）`
    : "未检测到";
  printSimpleItem("3", "代码后缀", cfg.codeExt, extDetail,
    "识别文档中引用的代码文件");

  const branchDetail = detected.baseBranch ? `当前分支: ${detected.baseBranch}` : "未检测到 git 仓库";
  printSimpleItem("4", "基础分支", cfg.baseBranch, branchDetail,
    "garden-apply PR 合并目标");

  printSimpleItem("5", "模块名录", catalogStr, `共 ${catalogTotal} 个条目`,
    "文档中的模块名对照代码实际名单");

  console.log("  └──────────────────────────────────────────────────────┘");
  console.log("");
}

function printSimpleItem(num, label, value, detail, help) {
  console.log(`  │ ${num}. ${label}`.padEnd(30) + `  ${value || "-"}`.padEnd(20) + "│");
  console.log(`  │    ${detail}`.padEnd(60) + "│");
  console.log(`  │    作用：${help}`.padEnd(60) + "│");
  console.log("  │                                                      │");
}

async function editDocsDir(cfg, detected) {
  console.log("\n  ── 文档目录 ──");
  console.log("  作用：扫描此目录下所有 .md 文档。");
  if (detected.docsDir) {
    console.log(`  检测到: ${detected.docsDir.path}/  (${detected.docsDir.mdCount} 个 .md 文件)`);
  } else {
    console.log("  ✗ 未检测到文档目录");
  }
  console.log(`  当前: ${cfg.docsDir}`);
  const val = await ask("  > ");
  if (val) cfg.docsDir = val;
}

async function editCodeDirs(cfg, detected) {
  console.log("\n  ── 代码目录 ──");
  console.log("  作用：检查文档引用的代码路径是否存活。");
  for (const d of detected.codeDirs) {
    console.log(`  检测到: ${d.name}/  (${d.fileCount} 个文件)`);
  }
  console.log(`  当前: ${cfg.codeDirs.join(", ")}`);
  const val = await ask("  逗号分隔，留空保持\n  > ");
  if (val) cfg.codeDirs = val.split(",").map((s) => s.trim()).filter(Boolean);
}

async function editCodeExt(cfg, detected) {
  console.log("\n  ── 代码后缀 ──");
  console.log("  作用：识别文档中引用的代码文件。");
  if (detected.codeExt) {
    console.log(`  检测到: ${detected.codeExt.primary}（占 ${detected.codeExt.primaryRatio}%）`);
  }
  console.log(`  当前: ${cfg.codeExt}`);
  const val = await ask("  以 . 开头\n  > ");
  if (val) cfg.codeExt = val;
}

async function editBaseBranch(cfg, detected) {
  console.log("\n  ── 基础分支 ──");
  console.log("  作用：garden-apply PR 合并到哪个分支。");
  if (detected.baseBranch) {
    console.log(`  检测到: ${detected.baseBranch}`);
  } else {
    console.log("  ✗ 未检测到 git 仓库");
  }
  console.log(`  当前: ${cfg.baseBranch}`);
  const val = await ask("  > ");
  if (val) cfg.baseBranch = val;
}

async function editCatalogs(projectRoot, cfg, detected) {
  console.log("\n  ── 模块名录 ──");
  console.log("  作用：文档中的模块名对照代码实际名单做验证。\n");

  while (true) {
    printCatalogMenu(cfg);
    const choice = await ask("  输入编号操作，输入 0 返回\n  > ");
    if (choice === "0") return;

    if (choice === "n") {
      await addCatalogEntry(projectRoot, cfg);
    } else if (choice === "r") {
      await removeCatalogEntry(cfg);
    } else {
      const keys = Object.keys(cfg.catalogs || {});
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < keys.length) {
        await editCatalogEntry(projectRoot, cfg, keys[idx]);
      } else {
        console.log("  无效选择");
      }
    }
    console.log("");
  }
}

function printCatalogMenu(cfg) {
  const entries = Object.entries(cfg.catalogs || {});
  console.log("  ┌──────────────────────────────────────────────────────┐");

  if (entries.length === 0) {
    console.log("  │   (暂无条目)".padEnd(60) + "│");
  } else {
    let num = 1;
    for (const [name, entry] of entries) {
      if (!entry || !entry.enabled) continue;
      const status = entry ? "✓" : "✗";
      const count = entry.source ? entry.source : "—";
      console.log(`  │ ${num}. ${name}`.padEnd(25) + `  ${status}  ${count}`.padEnd(30) + "│");
      num++;
    }
  }

  console.log("  +──────────────────────────────────────────────────────");
  console.log("  │ n. 新增名录条目".padEnd(60) + "│");
  if (entries.length > 0) console.log("  │ r. 删除名录条目".padEnd(60) + "│");
  console.log("  │ 0. 返回上层".padEnd(60) + "│");
  console.log("  └──────────────────────────────────────────────────────┘");
}

async function addCatalogEntry(projectRoot, cfg) {
  console.log("\n  ── 新增名录条目 ──");
  console.log("  提供以下信息添加新的模块名录：\n");

  const name = await ask("  名称（如 signals, strategies）\n  > ");
  if (!name) {
    console.log("  已取消");
    return;
  }

  const source = await ask("  源文件路径（如 src/signals/top.py）\n  > ");
  if (!source) {
    console.log("  已取消");
    return;
  }

  console.log("  提取策略：dict（从函数中提取字典键）或 argparse（解析命令行子命令）");
  const strategy = await ask("  [dict/argparse] > ");
  if (!strategy || !["dict", "argparse"].includes(strategy)) {
    console.log("  已取消");
    return;
  }

  let funcName = "";
  let prefix = "";

  if (strategy === "dict") {
    funcName = await ask("  函数名（如 build_signals_catalog）\n  > ");
    if (!funcName) {
      console.log("  已取消");
      return;
    }
  } else {
    prefix = await ask("  命令前缀（如 mycli）\n  > ");
    if (!prefix) {
      console.log("  已取消");
      return;
    }
  }

  const codeDir = await ask("  代码目录（模块文件所在，如 src/signals）\n  > ") || path.dirname(source);

  if (!cfg.catalogs) cfg.catalogs = {};
  cfg.catalogs[name] = {
    enabled: true,
    source,
    strategy,
    funcName: funcName || undefined,
    prefix: prefix || undefined,
    codeDir,
  };

  console.log(`\n  ✓ 已添加 "${name}"`);
}

async function removeCatalogEntry(cfg) {
  const entries = Object.entries(cfg.catalogs || {});
  if (entries.length === 0) {
    console.log("  没有可删除的条目");
    return;
  }

  console.log("\n  选择要删除的条目：");
  let i = 1;
  for (const [name] of entries) {
    console.log(`    ${i}. ${name}`);
    i++;
  }
  const choice = await ask("  > ");
  const idx = parseInt(choice) - 1;
  if (idx >= 0 && idx < entries.length) {
    const name = entries[idx][0];
    delete cfg.catalogs[name];
    console.log(`  ✓ 已删除 "${name}"`);
  }
}

async function editCatalogEntry(projectRoot, cfg, name) {
  const entry = cfg.catalogs[name];
  if (!entry) return;

  console.log(`\n  ── 编辑 "${name}" ──`);
  console.log(`  当前: source=${entry.source}, strategy=${entry.strategy}`);

  const source = await ask(`  源文件（留空不变）\n  > `);
  if (source) entry.source = source;

  const strategy = await ask(`  策略 dict/argparse（留空不变）\n  > `);
  if (strategy && ["dict", "argparse"].includes(strategy)) entry.strategy = strategy;

  if (entry.strategy === "dict") {
    const funcName = await ask(`  函数名（留空不变）\n  > `);
    if (funcName) entry.funcName = funcName;
    if (entry.prefix) delete entry.prefix;
  } else {
    const prefix = await ask(`  命令前缀（留空不变）\n  > `);
    if (prefix) entry.prefix = prefix;
    if (entry.funcName) delete entry.funcName;
  }

  const codeDir = await ask(`  代码目录（留空不变）\n  > `);
  if (codeDir) entry.codeDir = codeDir;

  console.log(`  ✓ 已更新 "${name}"`);
}
