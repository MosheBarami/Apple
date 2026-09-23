/**
 * THE FILES DRAWER AS A TREE, FLATTENED FOR RENDERING.
 *
 * The owner's picks: AI Elements `file-tree` and UI Layouts "Tree Code Viewer" (MIT). Both draw the
 * project's files as a folder tree with expandable folders. The store is flat — a folder is a prefix
 * two paths share — so the tree is derived here, one level at a time, from the same `browseRows`
 * the drawer always used. Nothing in the tree exists that is not a real file or the prefix of one.
 *
 * FLAT, NOT NESTED. The rows come back in reading order with a depth, which is how an ARIA tree is
 * rendered when every row carries its own actions: one list, `aria-level` on each row, and arrow keys
 * moving between rows in the order the eye reads them.
 */
import { browseRows, type BrowseRow, type ProjectFile } from '../../ws/files-model.ts';

export type TreeRow = BrowseRow & {
  /** 1 at the root, as `aria-level` counts. */
  depth: number;
  /** Folders only: whether the folder's children follow it in the list. */
  expanded: boolean;
};

/** Every visible row: a folder's children appear only while the folder is in `expanded`. */
export function treeRows(files: ProjectFile[], expanded: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = [];
  const walk = (prefix: string, depth: number) => {
    for (const row of browseRows(files, prefix)) {
      const open = row.kind === 'folder' && expanded.has(row.path);
      out.push({ ...row, depth, expanded: open });
      if (open) walk(row.path, depth + 1);
    }
  };
  walk('', 1);
  return out;
}

/** The folders that must be open for `path` to be visible — every prefix of it, shortest first. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  const out: string[] = [];
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    out.push(acc);
  }
  return out;
}

/**
 * Rewrite the expanded set after a folder moved or was deleted, so a renamed folder stays open under
 * its new name and a deleted one does not linger as an id nothing matches.
 */
export function moveExpanded(expanded: ReadonlySet<string>, from: string, to: string | null): Set<string> {
  const next = new Set<string>();
  for (const p of expanded) {
    if (p === from || p.startsWith(`${from}/`)) {
      if (to !== null) next.add(to + p.slice(from.length));
    } else next.add(p);
  }
  return next;
}
