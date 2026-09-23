/**
 * WHAT CHANGED BETWEEN TWO SAVED VERSIONS — the Eldora UI "GitHub Inline Comments" pick (MIT) under
 * an AI Elements `package-info` header.
 *
 * The pick's diff: a file header with a change badge, a hunk header, old and new line numbers side
 * by side, + and − gutters, tinted added/removed rows, and a comment bubble on any line. Added rows
 * take the accent (Apple's direction has no green); removed rows take `--bad`. The header reads the
 * way package-info reads a dependency bump: the name, "Version 2 → Version 4", how much changed.
 */
import { useState } from 'react';
import { PackageInfo, PackageInfoChangeType, PackageInfoHeader, PackageInfoName, PackageInfoVersion } from '../../ai-elements/package-info';
import { changeWords, type FileDiff } from './diff-model';
import { LineCommentButton, LineThread } from './line-thread';
import './tech-ui.css';
import './version-diff.css';

export function VersionDiff({
  path,
  from,
  to,
  diff,
  onAsk,
}: {
  path: string;
  from: string;
  to: string;
  diff: FileDiff;
  onAsk?: (line: number, code: string, question: string) => boolean;
}) {
  const [asking, setAsking] = useState<number | null>(null);
  const kind = diff.added > 0 && diff.removed === 0 ? 'added' : diff.removed > 0 && diff.added === 0 ? 'removed' : 'minor';

  return (
    <div className="vd">
      <PackageInfo name={path} className="vd-head">
        <PackageInfoHeader>
          <PackageInfoName>{path.split('/').pop()}</PackageInfoName>
          <PackageInfoChangeType type={kind}>{changeWords(diff)}</PackageInfoChangeType>
        </PackageInfoHeader>
        <PackageInfoVersion current={from} next={to} />
      </PackageInfo>
      {diff.lines.length === 0 ? (
        <p className="vd-same">These two versions are the same.</p>
      ) : (
        <ol className="vd-lines" aria-label={`Changes in ${path}`}>
          {diff.lines.map((l, i) => {
            const line = l.newNo ?? l.oldNo;
            const sign = l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' ';
            return (
              <li key={i} className={`vd-line vd-line--${l.kind}`}>
                <div className="vd-row">
                  {onAsk && l.kind !== 'hunk' && line !== null && (
                    <LineCommentButton line={line} open={asking === i} onClick={() => setAsking(asking === i ? null : i)} />
                  )}
                  <span className="vd-no" aria-hidden="true">{l.kind === 'hunk' ? '' : l.oldNo ?? ''}</span>
                  <span className="vd-no" aria-hidden="true">{l.kind === 'hunk' ? '' : l.newNo ?? ''}</span>
                  <span className="vd-code">
                    {l.kind !== 'hunk' && <span className="vd-sign" aria-hidden="true">{sign}</span>}
                    {l.kind === 'add' && <span className="tq-sr">Added: </span>}
                    {l.kind === 'del' && <span className="tq-sr">Removed: </span>}
                    {l.text}
                  </span>
                </div>
                {onAsk && asking === i && line !== null && (
                  <LineThread line={line} code={l.text} onAsk={(q) => onAsk(line, l.text, q)} onClose={() => setAsking(null)} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
