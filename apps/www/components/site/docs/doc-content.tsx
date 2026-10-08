import { AlertTriangleIcon, InfoIcon, LightbulbIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Block } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** **bold**, `code` and [text](href), the inline Markdown the docs use. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={key++}>{inline(m[1])}</strong>);
    else if (m[2]) out.push(<code key={key++}>{m[2]}</code>);
    else {
      const href = m[4];
      out.push(
        href.startsWith("/") ? (
          <Link href={href} key={key++}>
            {m[3]}
          </Link>
        ) : (
          <a href={href} key={key++} rel="noopener noreferrer" target={href.startsWith("mailto:") ? undefined : "_blank"}>
            {m[3]}
          </a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const CALLOUT = {
  note: { Icon: InfoIcon, className: "" },
  tip: { Icon: LightbulbIcon, className: "" },
  warning: { Icon: AlertTriangleIcon, className: "border-brand/40" },
} as const;

function Heading({ level, id, text }: { level: 2 | 3; id: string; text: string }) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag className="group relative scroll-mt-24" id={id}>
      {inline(text)}
      <a aria-label={`Link to ${text}`} className="ml-2 font-normal text-muted-foreground no-underline opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100" href={`#${id}`}>
        #
      </a>
    </Tag>
  );
}

export function DocBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return <Heading id={block.id} key={i} level={2} text={block.text} />;
          case "h3":
            return <Heading id={block.id} key={i} level={3} text={block.text} />;
          case "p":
            return <p key={i}>{inline(block.text)}</p>;
          case "ul":
          case "ol": {
            const List = block.type;
            return (
              <List key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            );
          }
          case "code":
            return (
              <div className="not-prose group/code relative" key={i}>
                <pre>
                  <code>{block.code}</code>
                </pre>
                <CopyButton text={block.code} />
              </div>
            );
          case "table":
            return (
              <table key={i}>
                <thead>
                  <tr>
                    {block.head.map((h, j) => (
                      <th key={j}>{inline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "callout": {
            const { Icon, className } = CALLOUT[block.kind];
            return (
              <aside className={cn("callout flex gap-3", className)} key={i}>
                <Icon className={cn("mt-[5px] size-4 shrink-0", block.kind === "warning" ? "text-brand" : "text-muted-foreground")} />
                <div className="min-w-0 space-y-1.5">
                  {block.title ? <p className="font-semibold text-foreground">{inline(block.title)}</p> : null}
                  <DocBlocks blocks={block.blocks} />
                </div>
              </aside>
            );
          }
          default:
            return <Fragment key={i} />;
        }
      })}
    </>
  );
}
