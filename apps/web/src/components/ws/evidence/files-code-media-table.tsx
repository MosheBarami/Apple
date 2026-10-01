/**
 * Evidence renderers for scripts, references, images, tables and affected Studio paths. Each takes
 * an adapted real value and returns null when it is absent; nothing here invents content.
 */
import { CodeBlock, CodeBlockActions, CodeBlockCopyButton, CodeBlockFilename, CodeBlockHeader, CodeBlockTitle } from '../../ai-elements/code-block';
import { Snippet, SnippetAddon, SnippetCopyButton, SnippetInput } from '../../ai-elements/snippet';
import { Image } from '../../ai-elements/image';
import { FileTree, FileTreeFile, FileTreeFolder } from '../../ai-elements/file-tree';
import {
  leafName, ORIGIN_LABEL, snippetOf, type ImageEvidence, type ScriptEvidence, type TableEvidence, type TreeRow,
} from './files-code-media-table-model';
import './files-code-media-table.css';

/** UI18. Collapsed by default: the source is not drawn until the person opens it. */
export function ScriptCodeBlock({ script }: { script: ScriptEvidence | null }) {
  if (!script) return null;
  const { path, className, revision, page } = script;
  return (
    <details className="ev-script" data-testid="ev-script">
      <summary className="ev-script__summary">
        <span>{leafName(path)}</span>
        <span className="ev-script__meta">
          {className ? `${className} · ` : ''}revision {revision ?? 'unavailable'}
          {page ? ` · lines ${page.startLine}-${page.endLine} of ${page.totalLines}` : ''}
        </span>
      </summary>
      <CodeBlock className="aie" code={script.source} language="luau" showLineNumbers>
        <CodeBlockHeader>
          <CodeBlockTitle><CodeBlockFilename>{path}</CodeBlockFilename></CodeBlockTitle>
          <CodeBlockActions><CodeBlockCopyButton /></CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </details>
  );
}

/** UI19. A short real reference (path or setting) with a copy control. */
export function ReferenceSnippet({ text, label }: { text: unknown; label?: string }) {
  const code = snippetOf(text);
  if (!code) return null;
  return (
    <Snippet className="aie" code={code} data-testid="ev-snippet">
      {label ? <SnippetAddon>{label}</SnippetAddon> : null}
      <SnippetInput aria-label={label ?? 'Reference'} />
      <SnippetAddon align="inline-end">
        <SnippetCopyButton aria-label="Copy reference" />
      </SnippetAddon>
    </Snippet>
  );
}

/** AI Elements' Image takes the `ai` GeneratedFile shape but draws only `base64` + `mediaType`. */
const NO_BYTES = new Uint8Array(0);

/** UI20. Always labelled by origin; composed artwork says it is not test evidence. */
export function EvidenceImage({ image }: { image: ImageEvidence | null }) {
  if (!image) return null;
  return (
    <figure className="ev-image" data-origin={image.origin} data-testid="ev-image">
      <Image base64={image.base64} uint8Array={NO_BYTES} mediaType={image.mediaType} alt={image.alt} />
      <figcaption className="ev-image__caption">
        <strong>{ORIGIN_LABEL[image.origin]}</strong>
        {image.provenance ? ` · ${image.provenance}` : ''}
        {image.origin === 'composed' ? ' · not test evidence' : ''}
      </figcaption>
    </figure>
  );
}

/** UI22. Real rows only; the first MAX_TABLE_ROWS, with the remainder counted. */
export function EvidenceTable({ table }: { table: TableEvidence | null }) {
  if (!table) return null;
  return (
    <div className="ev-table" data-testid="ev-table">
      <table>
        {table.caption ? <caption>{table.caption}</caption> : null}
        <thead><tr>{table.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>{table.columns.map((_, j) => <td key={j}>{r[j] ?? 'unavailable'}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {table.hidden > 0 ? <p className="ev-table__more">{table.hidden} more rows not shown</p> : null}
    </div>
  );
}

/** UI23. The Studio hierarchy the run touched; touched rows are marked, ancestors are context. */
export function AffectedTree({ rows }: { rows: TreeRow[] | null }) {
  if (!rows || rows.length === 0) return null;
  // Every ancestor is drawn open: the point is to show where the changed object sits.
  const open = new Set(rows.filter((r) => r.kind === 'folder').map((r) => r.path));
  const childrenOf = (r: TreeRow) => rows.filter((c) => c.level === r.level + 1 && c.path.startsWith(`${r.path}.`));
  // Upstream draws a row's name from `name` alone, so a touched row says "changed" in its name.
  const nameOf = (r: TreeRow) => (r.affected ? `${r.name} (changed)` : r.name);
  const draw = (r: TreeRow) =>
    r.kind === 'folder' ? (
      <FileTreeFolder key={r.path} path={r.path} name={nameOf(r)} data-affected={r.affected || undefined}>
        {childrenOf(r).map(draw)}
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={r.path} path={r.path} name={nameOf(r)} data-affected={r.affected || undefined} />
    );
  return (
    <FileTree className="aie" aria-label="Affected Studio objects" data-testid="ev-tree" defaultExpanded={open}>
      {rows.filter((r) => r.level === 1).map(draw)}
    </FileTree>
  );
}
