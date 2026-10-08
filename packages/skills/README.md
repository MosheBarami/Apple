# StudPilot skills

Knowledge and method for the StudPilot agent, in the [agentskills.io](https://agentskills.io) format. The owner's rule
(2026-10-08): **knowledge, not presets** — skills teach how to design, build, check and fix; they never ship premade
designs, kits, templates, preset values or asset lists. ("Give it the fishing rod, not the fish.")

## Format

```
packages/skills/<name>/SKILL.md          required
packages/skills/<name>/references/*.md   optional depth, one level deep
```

`SKILL.md` starts with YAML frontmatter:

- `name`: equals the folder name; lowercase letters, digits and single hyphens; 1-64 characters.
- `description`: up to 1024 characters; says what the skill covers **and** when to load it. It is all the agent sees
  until it loads the skill, so make it precise.

The body is Markdown, at most ~350 lines: method, decision rules, real API names, pitfalls, verification with the
agent's tools, and when to search the docs (`search_docs` / `read_doc`). Code only where it teaches an API.

## How skills are loaded

`node scripts/gen-skills.mjs` validates every skill and bundles them into `apps/studio/src/skills.generated.ts`
(`SKILLS: { name, description, body, files }[]`); `--check` exits 1 when that file is stale (the test in
`apps/studio/tests/skills.test.mjs` runs it). The agent's system prompt lists each skill's name and description
(~100 tokens each); the agent calls `load_skill` with a name to read the body, and with `file`
(e.g. `references/api-cheatsheet.md`) to read a reference.

Run the generator after every edit here and commit the generated file with it.
