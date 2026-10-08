import { PlusIcon } from "lucide-react";
import { FAQ } from "@/lib/site-data";
export function FaqList({
  items = FAQ,
}: {
  items?: readonly { q: string; a: string }[];
}) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details key={item.q} className="faq-item">
          <summary>
            {item.q}
            <PlusIcon className="size-4 shrink-0" />
          </summary>
          <div className="faq-answer">
            <p>{item.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
