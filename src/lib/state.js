import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const STATE_VERSION = 1;

let memoryFallback = null;

export function stateFilePath() {
  const override = process.env.DOCS_GARDENER_STATE_DIR;
  const base = override ? override : path.join(os.homedir(), ".docs-gardener");
  return path.join(base, "state.json");
}

export function projectKey(projectRoot) {
  return path.resolve(projectRoot);
}

export function readState() {
  if (memoryFallback) return memoryFallback;
  const filePath = stateFilePath();
  if (!fs.existsSync(filePath)) {
    return { version: STATE_VERSION, projects: {} };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { version: STATE_VERSION, projects: {} };
    }
    if (!parsed.projects) parsed.projects = {};
    parsed.version = STATE_VERSION;
    return parsed;
  } catch {
    return { version: STATE_VERSION, projects: {} };
  }
}

export function writeState(state) {
  const normalized = { version: STATE_VERSION, projects: state.projects || {} };
  if (memoryFallback) {
    memoryFallback = normalized;
    return { persisted: false, warning: "memory-only-fallback" };
  }
  const filePath = stateFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + "\n");
    return { persisted: true };
  } catch (err) {
    memoryFallback = normalized;
    return { persisted: false, warning: `state-write-failed:${err.code || err.message}` };
  }
}

export function getProject(projectRoot) {
  const state = readState();
  const key = projectKey(projectRoot);
  const project = state.projects[key] || {};
  return {
    projectRoot: key,
    hard: project.hard || null,
    soft: project.soft || null,
    findings: project.findings || null,
  };
}

export function updateProject(projectRoot, patch) {
  const state = readState();
  const key = projectKey(projectRoot);
  const current = state.projects[key] || {};
  const next = {
    ...current,
    ...patch,
  };
  state.projects[key] = next;
  const result = writeState(state);
  return { project: next, ...result };
}

export function markScan(projectRoot, kind, envelope, hash) {
  const record = {
    hash,
    envelope,
    scannedAt: new Date().toISOString(),
    rendered: false,
    renderedAt: null,
  };
  const patch = {};
  patch[kind] = record;
  if (kind === "hard") {
    patch.soft = null;
    patch.findings = null;
  }
  if (kind === "soft") {
    patch.findings = null;
  }
  return updateProject(projectRoot, patch);
}

export function markRendered(projectRoot, kind) {
  const project = getProject(projectRoot);
  const record = project[kind];
  if (!record) {
    return { updated: false, reason: `no-${kind}-scan` };
  }
  const updated = { ...record, rendered: true, renderedAt: new Date().toISOString() };
  const patch = {};
  patch[kind] = updated;
  const result = updateProject(projectRoot, patch);
  return { updated: true, ...result };
}

export function setFindings(projectRoot, findings) {
  const project = getProject(projectRoot);
  if (!project.soft) {
    return { updated: false, reason: "no-soft-scan" };
  }
  return updateProject(projectRoot, {
    findings: {
      hardSummaryRef: project.soft.hash,
      reports: findings,
      submittedAt: new Date().toISOString(),
    },
  });
}

export function hashPayload(payload) {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 12);
}

export function resetMemoryFallback() {
  memoryFallback = null;
}
