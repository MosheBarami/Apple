import { PlusIcon } from "lucide-react";
import { FAQ } from "@/lib/site-data";
export function FaqList({
  items = FAQ,
}: {
  items?: readonly { q: string; a: string }[];
}) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <details className="group" key={item.q}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-base font-medium">
            {item.q}
            <PlusIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
          </summary>
          <p className="max-w-2xl pb-6 text-sm leading-7 text-muted-foreground">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
