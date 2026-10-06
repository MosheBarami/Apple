/**
 * THE REPLY IS FOR A YOUNG CREATOR, NOT AN ENGINEER (owner, 2026-09-30). The model's own words leaked the machinery:
 * "every screen will be assembled from stored library components … checked with check_ui_layout and the layout flags".
 * A sentence that names one of StudPilot's tools, or a Roblox path like game.ServerScriptService or /StarterGui/Main, is dropped
 * from the reply; the rest stands. A reply that would be left empty keeps its words with the tool names taken out.
 */
const PATHISH = /\bgame\.[A-Z]\w+|(?:^|\s)\/(?:Workspace|StarterGui|ReplicatedStorage|ServerScriptService|ServerStorage|StarterPlayer)\b|\brbxassetid:\/\//;

export function withoutToolTalk(text: string, tools: readonly string[]): string {
  if (!text) return text;
  const names = tools.filter((t) => /_/.test(t)).sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!names.length) return text;
  const named = new RegExp(`\\b(?:${names.join('|')})\\b`);
  const technical = (s: string) => named.test(s) || PATHISH.test(s);
  const kept = text.split(/\n{2,}/).map((para) => {
    const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
    return sentences.filter((s) => !technical(s)).join(' ').trim();
  }).filter(Boolean).join('\n\n');
  if (kept.trim()) return kept;
  return text.replace(new RegExp(`\\s*\\b(?:${names.join('|')})\\b`, 'g'), '').trim();
}
