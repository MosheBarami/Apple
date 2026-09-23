// AI Elements `file-tree`, re-implemented for this app, merged with the UI Layouts "Tree Code
// Viewer" pick (MIT) — both of which the owner picked for the same place.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) nests FileTreeFolder/FileTreeFile with a
// chevron, folder/file icons, names and per-row actions. Tree Code Viewer adds the indent guide
// (a hairline down each open folder) and the selected row. Here the tree is rendered FLAT — rows in
// reading order, each with its `aria-level` — because every row of the Files drawer carries its own
// buttons, and a flat treeitem list is how an ARIA tree with row actions stays keyboard-reachable:
//
//   ↑ / ↓      move between rows          → / ←   open / close a folder (or step in / out)
//   Home / End first / last row           Enter    open the row (the row's own main control)
//
// The component owns the keyboard and the look; the drawer owns what a row does.
import { useCallback, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './lib/utils';
import { ChevronIcon, FileIcon, FolderIcon, FolderOpenIcon } from '../picks/tech/icons';
import './file-tree.css';

const ROW = '[data-tree-main]';

export type FileTreeProps = HTMLAttributes<HTMLDivElement> & {
  /** Called with a row's path when ← / → asks to close or open it. */
  onToggle?: (path: string, open: boolean) => void;
};

export const FileTree = ({ className, onToggle, onKeyDown, children, ...props }: FileTreeProps) => {
  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (!target.matches(ROW)) return;
      const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(ROW)];
      const at = rows.indexOf(target);
      if (at < 0) return;
      const focus = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
      const path = target.dataset.treePath ?? '';
      const level = Number(target.dataset.treeLevel ?? '1');
      const folder = target.dataset.treeKind === 'folder';
      const open = target.dataset.treeOpen === 'true';
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); focus(at + 1); break;
        case 'ArrowUp': e.preventDefault(); focus(at - 1); break;
        case 'Home': e.preventDefault(); focus(0); break;
        case 'End': e.preventDefault(); focus(rows.length - 1); break;
        case 'ArrowRight':
          e.preventDefault();
          if (folder && !open) onToggle?.(path, true);
          else if (folder) focus(at + 1);
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          if (folder && open) { onToggle?.(path, false); break; }
          // Step out to the parent folder row.
          for (let i = at - 1; i >= 0; i--) {
            if (Number(rows[i]?.dataset.treeLevel ?? '1') < level) { focus(i); break; }
          }
          break;
        }
      }
    },
    [onKeyDown, onToggle],
  );
  return (
    <div role="tree" className={cn('ai-tree', className)} onKeyDown={handleKey} {...props}>
      {children}
    </div>
  );
};

export type FileTreeRowProps = HTMLAttributes<HTMLDivElement> & {
  level: number;
  kind: 'folder' | 'file';
  open?: boolean;
  selected?: boolean;
};

/** One treeitem. Its main control must carry `fileTreeMainProps(...)` so the keyboard can find it. */
export const FileTreeRow = ({ level, kind, open = false, selected = false, className, style, children, ...props }: FileTreeRowProps) => (
  <div
    role="treeitem"
    aria-level={level}
    aria-expanded={kind === 'folder' ? open : undefined}
    aria-selected={kind === 'file' ? selected : undefined}
    className={cn('ai-tree__row', `ai-tree__row--${kind}`, selected && 'is-selected', className)}
    style={{ ...style, ['--tree-level' as string]: level - 1 }}
    {...props}
  >
    {children}
  </div>
);

/** The data attributes the keyboard handler reads off a row's main control. */
export const fileTreeMainProps = (path: string, level: number, kind: 'folder' | 'file', open = false) => ({
  'data-tree-main': '',
  'data-tree-path': path,
  'data-tree-level': String(level),
  'data-tree-kind': kind,
  'data-tree-open': String(open),
});

export const FileTreeIcon = ({ kind, open = false }: { kind: 'folder' | 'file'; open?: boolean }) => (
  <span className="ai-tree__icons" aria-hidden="true">
    {kind === 'folder'
      ? <span className={cn('ai-tree__chevron', open && 'is-open')}><ChevronIcon size={12} /></span>
      : <span className="ai-tree__chevron" />}
    {kind === 'folder' ? (open ? <FolderOpenIcon size={15} /> : <FolderIcon size={15} />) : <FileIcon size={15} />}
  </span>
);

export const FileTreeName = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-tree__name', className)} {...props} />
);

export const FileTreeMeta = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-tree__meta', className)} {...props} />
);

export const FileTreeActions = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
  <div className={cn('ai-tree__actions', className)} {...props}>{children}</div>
);
