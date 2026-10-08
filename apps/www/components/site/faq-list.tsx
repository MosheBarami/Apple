import { FAQ } from "@/lib/site-data";
export function FaqList({
  items = FAQ,
}: {
  items?: readonly { q: string; a: string }[];
}) {
  return (
    <div className="reference-faq-list">
      {items.map((x) => (
        <details key={x.q}>
          <summary>
            {x.q}
            <span>↓</span>
          </summary>
          <p>{x.a}</p>
        </details>
      ))}
    </div>
  );
}
