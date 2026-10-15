import fs from "node:fs";
import path from "node:path";
import type { ActivityEvent, BillCase, RuntimeConfig } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CASES_DIR = path.join(DATA_DIR, "claimless-cases");
const UPLOADS_DIR = path.join(DATA_DIR, "claimless-uploads");
const RUNTIME_FILE = path.join(DATA_DIR, "runtime.json");

function ensureDirs() {
  for (const dir of [DATA_DIR, CASES_DIR, UPLOADS_DIR]) fs.mkdirSync(dir, { recursive: true });
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

function safeId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid case id");
  return id;
}

function caseFile(id: string) {
  return path.join(CASES_DIR, `${safeId(id)}.json`);
}

function eventFile(id: string) {
  return path.join(CASES_DIR, `${safeId(id)}.events.json`);
}

export function listCases(): BillCase[] {
  ensureDirs();
  return fs.readdirSync(CASES_DIR)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".events.json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), "utf8")) as BillCase)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCase(id: string): BillCase | null {
  ensureDirs();
  const file = caseFile(id);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as BillCase : null;
}

export function saveCase(value: BillCase) {
  ensureDirs();
  value.updatedAt = nowIso();
  const target = caseFile(value.id);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, target);
}

export function updateCase(id: string, mutate: (value: BillCase) => void) {
  const value = getCase(id);
  if (!value) throw new Error(`Case ${id} not found`);
  mutate(value);
  saveCase(value);
  return value;
}

export function getEvents(id: string): ActivityEvent[] {
  ensureDirs();
  const file = eventFile(id);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as ActivityEvent[] : [];
}

export function audit(id: string, actor: ActivityEvent["actor"], action: string, message: string) {
  const events = getEvents(id);
  const event: ActivityEvent = { id: newId("event"), at: nowIso(), actor, action, message };
  events.push(event);
  fs.writeFileSync(eventFile(id), JSON.stringify(events, null, 2));
  return event;
}

export function saveUpload(caseId: string, fileName: string, data: Buffer) {
  ensureDirs();
  const dir = path.join(UPLOADS_DIR, safeId(caseId));
  fs.mkdirSync(dir, { recursive: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = path.join(dir, safeName);
  fs.writeFileSync(file, data);
  return file;
}

export function getRuntime(): RuntimeConfig {
  ensureDirs();
  try { return JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf8")) as RuntimeConfig; } catch { return {}; }
}

export function setRuntime(value: RuntimeConfig) {
  ensureDirs();
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify({ ...value, updatedAt: nowIso() }, null, 2));
}
