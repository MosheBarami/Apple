import {
  ArrowUpRightIcon,
  LinkIcon,
  MessageSquareIcon,
  Undo2Icon,
} from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

const STEPS = [
  {
    body: "Pair your Studio project with a six-character code. You control when StudPilot can make changes.",
    detail: "01 / CONNECT",
    icon: LinkIcon,
    title: "Your place. Your starting point.",
  },
  {
    body: "Describe a new idea or a change to something you already made. Keep the context and follow the work in one chat.",
    detail: "02 / CREATE & REFINE",
    icon: MessageSquareIcon,
    title: "Start with a conversation.",
  },
  {
    body: "Review what changed, see what still needs attention, and ask for the next edit. A checkpoint lets you go back.",
    detail: "03 / REVIEW",
    icon: Undo2Icon,
    title: "Keep shaping it in Studio.",
  },
];
export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-title"
      className="border-b border-border py-20 lg:py-28"
      id="how-it-works"
    >
      <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="studio-eyebrow">
              A little less friction. A lot more creating.
            </p>
            <h2
              className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
              id="how-title"
            >
              From “what if”
              <br />
              to your next iteration.
            </h2>
          </div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-signal"
            href="/docs"
          >
            Explore the workflow <ArrowUpRightIcon className="size-4" />
          </Link>
        </Reveal>
        <ol className="mt-14 grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {STEPS.map((s, i) => (
            <Reveal
              as="li"
              className="py-8 first:pl-0 md:px-8 md:py-0"
              delay={i * 80}
              key={s.title}
            >
              <s.icon className="mb-9 size-6 text-signal" strokeWidth={1.5} />
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                {s.detail}
              </p>
              <h3 className="mt-3 text-xl font-medium tracking-tight">
                {s.title}
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
                {s.body}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
