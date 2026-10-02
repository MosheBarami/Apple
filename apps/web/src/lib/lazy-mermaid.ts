import type { DiagramPlugin, MermaidInstance } from "@streamdown/mermaid";

/**
 * @streamdown/mermaid, loaded on FIRST USE.
 *
 * The package's plugin does `import mermaid from 'mermaid'` at its top, so importing it statically
 * put mermaid (the largest dependency in the app: a 2.4 MB chunk, 690 kB gzipped with the workspace)
 * in the download of every user who opened a project, to render a diagram most conversations never
 * contain. This is the same plugin behind the same interface, reached through an `import()` inside
 * `render`, which streamdown already awaits. A message with a ```mermaid block fetches the library
 * the moment that block is drawn; nobody else does. message.tsx and reasoning.tsx import this in
 * place of the package's own `mermaid` (a recorded patch in components/ai-elements/NOTICE).
 */
export const mermaid: DiagramPlugin = {
  name: "mermaid",
  type: "diagram",
  language: "mermaid",
  getMermaid(config) {
    let latest = config;
    let instance: Promise<MermaidInstance> | null = null;
    const load = () => (instance ??= import("@streamdown/mermaid").then((m) => m.mermaid.getMermaid(latest)));
    return {
      initialize(next) {
        latest = next;
        void instance?.then((i) => i.initialize(next));
      },
      async render(id, source) {
        return (await load()).render(id, source);
      },
    };
  },
};
