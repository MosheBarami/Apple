import fs from "node:fs";
import path from "node:path";
import { skillsDir } from "./config";

export type Skill = { name: string; description: string; body: string; file: string };

function parse(file: string, raw: string): Skill | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  if (!fm.name || !fm.description) return null;
  return { name: fm.name, description: fm.description, body: m[2].trim(), file };
}

export function listSkills(): Skill[] {
  const dir = skillsDir();
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const out: Skill[] = [];
  for (const f of files) {
    const s = parse(`skills/${f}`, fs.readFileSync(path.join(dir, f), "utf8"));
    if (s) out.push(s);
  }
  return out;
}

export function getSkill(name: string): Skill | undefined {
  const n = name.trim().toLowerCase();
  return listSkills().find((s) => s.name.toLowerCase() === n);
}
