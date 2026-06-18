import path from "path";

export const DEFAULT_ARCHITECTURE = [
  {
    role: "index",
    path: "docs/index.md",
    purpose: "Documentation entrypoint and reading order.",
    core: true,
  },
  {
    role: "overview",
    path: "docs/README.md",
    purpose: "What the project is, where it fits, and what it is not for.",
    core: true,
  },
  {
    role: "quickstart",
    path: "docs/quickstart.md",
    purpose: "Shortest path to a working setup.",
    core: true,
  },
  {
    role: "usage",
    path: "docs/usage.md",
    purpose: "Main commands or workflows.",
    core: true,
  },
  {
    role: "configuration",
    path: "docs/configuration.md",
    purpose: "Config fields, defaults, and examples.",
    core: true,
  },
  {
    role: "development",
    path: "docs/development.md",
    purpose: "Local development, tests, and release notes for maintainers.",
    core: false,
  },
  {
    role: "troubleshooting",
    path: "docs/troubleshooting.md",
    purpose: "Common failures and recovery notes.",
    core: false,
  },
  {
    role: "style",
    path: "docs/style.md",
    purpose: "Local documentation writing conventions.",
    core: false,
  },
];

const ROLE_PATTERNS = {
  index: [/index/i, /documentation/i, /目录/, /索引/],
  overview: [/overview/i, /readme/i, /project/i, /介绍/, /概览/],
  quickstart: [/quickstart/i, /getting started/i, /快速开始/],
  usage: [/usage/i, /command/i, /workflow/i, /用法/, /流程/],
  configuration: [/configuration/i, /config/i, /配置/],
  development: [/development/i, /test/i, /maintainer/i, /开发/, /测试/],
  troubleshooting: [/troubleshooting/i, /failure/i, /error/i, /排障/, /故障/],
  style: [/style/i, /writing/i, /guidance/i, /写作/, /风格/],
};

export function validateArchitecture(projectRoot, docsDir, files) {
  const relativeFiles = files.map((file) => normalizePath(path.relative(projectRoot, file)));
  const matchedRoles = [];
  const missingCoreRoles = [];
  const missingRecommendedRoles = [];
  const ambiguousRoles = [];

  for (const role of DEFAULT_ARCHITECTURE) {
    const matches = relativeFiles.filter((file) => roleMatches(role.role, file));
    if (matches.length === 0) {
      if (role.core) {
        missingCoreRoles.push(role);
      } else {
        missingRecommendedRoles.push(role);
      }
      continue;
    }

    matchedRoles.push({
      role: role.role,
      expectedPath: role.path.replace(/^docs\//, `${docsDir}/`),
      files: matches,
    });

    if (matches.length > 1) {
      ambiguousRoles.push({
        role: role.role,
        files: matches,
      });
    }
  }

  return {
    reference: DEFAULT_ARCHITECTURE.map((role) => ({
      ...role,
      path: role.path.replace(/^docs\//, `${docsDir}/`),
    })),
    matchedRoles,
    missingCoreRoles: withDocsDir(missingCoreRoles, docsDir),
    missingRecommendedRoles: withDocsDir(missingRecommendedRoles, docsDir),
    ambiguousRoles,
  };
}

function roleMatches(role, file) {
  const base = path.basename(file, ".md");
  return (ROLE_PATTERNS[role] || []).some((pattern) => pattern.test(file) || pattern.test(base));
}

function withDocsDir(roles, docsDir) {
  return roles.map((role) => ({
    ...role,
    path: role.path.replace(/^docs\//, `${docsDir}/`),
  }));
}

function normalizePath(file) {
  return file.split(path.sep).join("/");
}
