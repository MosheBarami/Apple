import {
  MessageSquareIcon,
  CableIcon,
  ScanEyeIcon,
  ArrowUpRightIcon,
  CheckIcon,
  Wand2Icon,
  LayersIcon,
} from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";
const CAPABILITIES = [
  {
    icon: LayersIcon,
    title: "Interfaces that belong in your game",
    body: "Menus, shops, inventories and HUDs. Describe the experience you want, then keep refining it.",
    tag: "CREATE",
  },
  {
    icon: Wand2Icon,
    title: "Your existing project. More possibilities.",
    body: "Bring the context you already have. Explore your place, work on a mechanic, or ask for a focused edit.",
    tag: "REFINE",
  },
  {
    icon: ScanEyeIcon,
    title: "Know what happened at every step",
    body: "Follow the work, review the result and see what still needs attention. Keep the conversation with your project.",
    tag: "UNDERSTAND",
  },
];
export function HowItWorks() {
  return (
    <>
      <section className="workflow-strip" aria-label="The StudPilot workflow">
        <div>
          <span>YOUR IDEA</span>
          <i />
          <span>ONE CONVERSATION</span>
          <i />
          <span>YOUR STUDIO PROJECT</span>
          <i />
          <span>THE NEXT ITERATION</span>
        </div>
      </section>
      <section
        className="capabilities section-space"
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <div className="site-container">
          <Reveal className="section-heading">
            <p className="studio-eyebrow">
              <span />
              CREATE WITHOUT THE FRICTION
            </p>
            <h2 id="how-title">
              You bring the vision.
              <br />
              <span className="text-muted-foreground">
                We keep the momentum.
              </span>
            </h2>
            <p>
              A workspace built around the way ideas evolve.
              <br />
              Start small. Try things. Make them yours.
            </p>
          </Reveal>
          <div className="feature-grid">
            {CAPABILITIES.map((c, i) => (
              <Reveal
                key={c.title}
                delay={i * 90}
                className={`feature-panel feature-${i} luminous-panel`}
              >
                <div className="feature-visual" aria-hidden>
                  {i === 0 ? (
                    <div className="mini-interface">
                      <div />
                      <span />
                      <span />
                      <b>
                        <span />
                        <span />
                      </b>
                    </div>
                  ) : i === 1 ? (
                    <div className="mini-connections">
                      <span>
                        <Wand2Icon />
                      </span>
                      <i />
                      <span>
                        <LayersIcon />
                      </span>
                      <i />
                      <span>
                        <CheckIcon />
                      </span>
                    </div>
                  ) : (
                    <div className="mini-steps">
                      {[
                        "Request understood",
                        "Changes made",
                        "Review the result",
                      ].map((v, k) => (
                        <span key={v}>
                          <CheckIcon />
                          {v}
                          <i style={{ animationDelay: `${k * 0.4}s` }} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="studio-eyebrow">{c.tag}</p>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </Reveal>
            ))}
          </div>
          <div className="journey-band">
            <Reveal>
              <p className="studio-eyebrow">YOUR FIRST FIVE MINUTES</p>
              <h3>One simple creative loop.</h3>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 text-sm text-signal"
              >
                Get the setup guide
                <ArrowUpRightIcon className="size-4" />
              </Link>
            </Reveal>
            <ol>
              {[
                {
                  n: "01",
                  icon: MessageSquareIcon,
                  title: "Start the conversation",
                  text: "Describe your idea in plain words.",
                },
                {
                  n: "02",
                  icon: CableIcon,
                  title: "Connect your place",
                  text: "Pair Studio with a six-character code.",
                },
                {
                  n: "03",
                  icon: ScanEyeIcon,
                  title: "Review & keep shaping",
                  text: "See what changed. Ask for the next edit.",
                },
              ].map((s) => (
                <li key={s.n}>
                  <span className="step-number">{s.n}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
