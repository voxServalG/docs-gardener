import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function apply(projectRoot, config, { branch, title, body, fixes }) {
  function git(cmd) {
    return execSync(`git ${cmd}`, { cwd: projectRoot, encoding: "utf-8" }).trim();
  }

  function gh(cmd) {
    return execSync(`gh ${cmd}`, { cwd: projectRoot, encoding: "utf-8" }).trim();
  }

  const baseBranch = config.baseBranch || "main";

  if (!workingTreeClean(git)) {
    return {
      ok: false,
      error: "工作区不干净，请先提交或暂存所有修改",
    };
  }

  const results = [];
  let appliedFiles = [];

  try {
    for (const { file, edits } of fixes) {
      const fullPath = path.join(projectRoot, file);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`文件不存在: ${file}`);
      }
      applyEdit(fullPath, edits);
      appliedFiles.push(file);
      results.push({ file, status: "applied", editCount: edits.length });
    }

    const currentBranch = git("branch --show-current");
    if (currentBranch === branch) {
      git("add .");
      git(`commit -m "docs: gardening fixes"`);
    } else {
      git("checkout -b " + branch);
      git("add .");
      git(`commit -m "docs: gardening fixes"`);
    }

    git(`push origin ${branch}`);
    const prUrl = gh(
      `pr create --title "${escapeShell(title)}" --body "${escapeShell(body)}" --head ${branch} --base ${baseBranch}`
    );

    return {
      ok: true,
      url: prUrl,
      branch,
      fixes: results,
    };
  } catch (err) {
    if (appliedFiles.length > 0) {
      try {
        git("checkout -- " + appliedFiles.join(" "));
        const originalBranch = git("branch --show-current");
        if (originalBranch === branch && originalBranch !== baseBranch) {
          git(`checkout ${baseBranch}`);
          git("branch -D " + branch);
        }
      } catch {
        // best effort rollback
      }
    }
    return {
      ok: false,
      error: err.message,
    };
  }
}

function workingTreeClean(git) {
  try {
    git("diff --quiet");
    git("diff --cached --quiet");
    return true;
  } catch {
    return false;
  }
}

function applyEdit(filePath, edits) {
  let content = fs.readFileSync(filePath, "utf-8");
  for (const edit of edits) {
    if (!content.includes(edit.oldText)) {
      throw new Error(
        `编辑失败: ${path.basename(filePath)} 中找不到匹配文本`
      );
    }
    content = content.replace(edit.oldText, edit.newText);
  }
  fs.writeFileSync(filePath, content);
}

function escapeShell(str) {
  return str.replace(/"/g, '\\"');
}
