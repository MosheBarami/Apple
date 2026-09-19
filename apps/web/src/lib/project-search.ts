/** Search the fetched scope without changing its pin/recency ordering. */
export function filterProjects<T extends {
  name: string;
  description?: string | null;
  memory_summary?: string | null;
  place_name?: string | null;
  tags?: string[];
}>(projects: T[], query: string): T[] {
  const terms = query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return projects;
  return projects.filter(project => {
    const text = [project.name, project.description, project.memory_summary, project.place_name,
      ...(project.tags ?? [])].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
    return terms.every(term => text.includes(term));
  });
}
