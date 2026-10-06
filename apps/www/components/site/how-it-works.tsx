import { CheckIcon, CornerDownLeftIcon } from "lucide-react";
import { Reveal } from "./reveal";

const CODE = ["K", "7", "M", "3", "Q", "P"];

function StepCard({
  n,
  title,
  body,
  tone,
  children,
}: {
  n: number;
  title: string;
  body: string;
  tone: "sky" | "sun" | "lime";
  children: React.ReactNode;
}) {
  const bar = {
    sky: "[--bar-hi:var(--color-sky-hi)] [--bar-lo:var(--color-sky)] [--bar-edge:var(--color-sky-edge)]",
    sun: "[--bar-hi:var(--color-sun-hi)] [--bar-lo:var(--color-sun-deep)] [--bar-edge:var(--color-sun-edge)]",
    lime: "[--bar-hi:var(--color-lime-hi)] [--bar-lo:var(--color-lime)] [--bar-edge:var(--color-lime-edge)]",
  }[tone];
  return (
    <article
      className={`window group flex h-full flex-col hover:-translate-y-1.5 hover:shadow-[0_12px_0_var(--color-ink)] ${bar}`}
    >
      <span
        aria-hidden
        className="absolute -top-5 -left-4 z-10 grid size-12 -rotate-6 place-items-center rounded-[6px] border-[3px] border-ink bg-white font-display font-bold text-[1.6rem] text-ink shadow-[0_4px_0_var(--color-ink)] transition-transform duration-300 group-hover:rotate-0"
      >
        {n}
      </span>
      <div className="window-bar studs relative flex min-h-[4.75rem] items-center py-3 pr-5 pl-14">
        <h3 className="font-display font-semibold text-[1.35rem] text-ink leading-tight">{title}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-5 p-5">
        <p className="text-[1rem] text-white/90 leading-relaxed">{body}</p>
        <div className="mt-auto">{children}</div>
      </div>
    </article>
  );
}

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-title"
      className="relative isolate overflow-hidden bg-night py-20 text-white lg:py-28"
      id="how-it-works"
    >
      <div aria-hidden className="studs absolute -inset-y-[300px] right-0 left-0 -z-10 opacity-25" data-parallax="0.08" />
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <p className="font-display font-semibold text-lg text-lime">How it works</p>
          <h2 className="mt-2 font-display font-semibold text-[32px] leading-[1.1] md:text-[46px]" id="how-title">
            Three steps from idea to something in your place
          </h2>
        </Reveal>

        <ol className="mt-14 grid gap-9 md:grid-cols-3 md:gap-6 lg:gap-8">
          <Reveal as="li" delay={0}>
            <StepCard
              body="Open the StudPilot plugin in Roblox Studio and type the 6-character code from your chat. Edits stay off until you switch them on."
              n={1}
              title="Pair Studio with a code"
              tone="sky"
            >
              <div className="rounded-[5px] border-2 border-ink bg-ink/60 p-3">
                <p className="mb-2 text-[11px] text-white/70 uppercase tracking-[0.1em]">Example code</p>
                <div className="flex gap-1.5" aria-label="Example pairing code K 7 M 3 Q P" role="img">
                  {CODE.map((c, i) => (
                    <span
                      aria-hidden
                      className="grid h-11 flex-1 place-items-center rounded-[4px] border-2 border-sky-edge bg-gradient-to-b from-white to-[#cfe6fb] font-mono font-bold text-[1.25rem] text-ink shadow-[0_3px_0_var(--color-sky-edge)] transition-transform duration-200 hover:-translate-y-0.5"
                      key={`${c}-${i}`}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </StepCard>
          </Reveal>

          <Reveal as="li" delay={120}>
            <StepCard
              body="Say it in plain words: a shop screen, a rewards system, a path lined with benches. No scripting needed."
              n={2}
              title="Describe what you want"
              tone="sun"
            >
              <div className="rounded-[5px] border-2 border-ink bg-ink/60 p-3">
                <p className="mb-2 text-[11px] text-white/70 uppercase tracking-[0.1em]">Example request</p>
                <div className="flex items-end gap-2 rounded-[5px] border border-white/20 bg-night p-2.5">
                  <p className="flex-1 text-[0.95rem] text-white leading-snug">
                    Add an egg shop with a Buy button
                    <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-lime" />
                  </p>
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-[5px] bg-lime text-ink"
                  >
                    <CornerDownLeftIcon className="size-4" strokeWidth={2.6} />
                  </span>
                </div>
              </div>
            </StepCard>
          </Reveal>

          <Reveal as="li" delay={240}>
            <StepCard
              body="It saves a checkpoint, builds right in your place one step at a time, and checks each step. Undo changes puts everything back."
              n={3}
              title="StudPilot builds it and checks it"
              tone="lime"
            >
              <div className="rounded-[5px] border-2 border-ink bg-ink/60 p-3">
                <p className="mb-2 text-[11px] text-white/70 uppercase tracking-[0.1em]">Example steps</p>
                <ul className="space-y-1.5 text-[0.9rem] text-white">
                  {["Checkpoint saved", "Building your request", "Checking each step"].map((s) => (
                    <li className="flex items-center gap-2" key={s}>
                      <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[4px] bg-lime text-ink">
                        <CheckIcon className="size-3.5" strokeWidth={3.2} />
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </StepCard>
          </Reveal>
        </ol>
      </div>
    </section>
  );
}
