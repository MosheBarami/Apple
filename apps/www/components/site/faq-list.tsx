import { PlusIcon } from "lucide-react";
import { FAQ } from "@/lib/site-data";
import { Reveal } from "./reveal";

export function FaqList({ items = FAQ }: { items?: readonly { q: string; a: string }[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <Reveal delay={Math.min(i, 4) * 60} key={item.q}>
          <details className="faq group rounded-[6px] border-[3px] border-ink bg-white text-ink shadow-[0_5px_0_var(--color-ink)] transition-shadow duration-200 hover:shadow-[0_7px_0_var(--color-ink)] open:bg-white">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[4px] px-5 py-3.5 font-display font-semibold text-[1.15rem] leading-snug focus-visible:outline-offset-4">
              {item.q}
              <span
                aria-hidden
                className="faq-plus grid size-8 shrink-0 place-items-center rounded-[5px] border-2 border-ink bg-sun transition-transform duration-300"
              >
                <PlusIcon className="size-4" strokeWidth={3} />
              </span>
            </summary>
            <p className="px-5 pt-0 pb-5 text-[1.02rem] text-[#232c52] leading-relaxed">{item.a}</p>
          </details>
        </Reveal>
      ))}
    </div>
  );
}
