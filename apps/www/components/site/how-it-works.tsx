"use client";
import Link from "next/link";
import { StudioDemo } from "@/components/creative/studio-demo";
import { STARTERS, EDIT_STARTERS } from "@/components/app/starters";
const EXAMPLES = [...STARTERS, ...EDIT_STARTERS];
export function HowItWorks() {
  return (
    <>
      <section className="reference-capabilities site-container">
        <p>For the different parts of your Roblox project.</p>
        <div>
          {[
            "Interfaces",
            "Systems",
            "Props",
            "Worlds",
            "Audio",
            "Effects",
            "Animation",
            "Edits",
          ].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>
      <section className="reference-features site-container" id="how-it-works">
        {[
          {
            title: "Turn ideas into your next build",
            body: "Describe what your game needs and work with an agent connected to your own Roblox Studio place.",
            link: "Explore the workspace →",
            href: "/product",
            variant: "shop",
          },
          {
            title: "Keep the context. Keep creating.",
            body: "Open a project, follow the work and ask for the next change. Your conversation stays beside the result.",
            link: "Learn about projects →",
            href: "/app/projects",
            variant: "activity",
          },
          {
            title: "Understand every change",
            body: "See what the agent did, what was checked and what still needs attention. Keep the useful details close.",
            link: "Read the getting started guide →",
            href: "/docs",
            variant: "code",
          },
          {
            title: "Bring StudPilot into your Studio",
            body: "Pair once with a six-character code. You choose when changes are enabled, and a checkpoint gives you a way back.",
            link: "Connect your project →",
            href: "/docs#pair",
            variant: "connection",
          },
        ].map((f, i) => (
          <article
            key={f.title}
            className={`reference-feature ${i % 2 ? "is-reversed" : ""}`}
          >
            <div className="feature-copy">
              <h2>{f.title}</h2>
              <p>{f.body}</p>
              <Link href={f.href}>{f.link}</Link>
            </div>
            <div className="feature-product">
              <StudioDemo
                autoPlay={f.variant !== "connection"}
                variant={
                  f.variant as "shop" | "activity" | "code" | "connection"
                }
              />
            </div>
          </article>
        ))}
      </section>
      <section className="reference-examples site-container">
        <h2>A new way to work on your game.</h2>
        <div>
          {EXAMPLES.map((s) => (
            <article data-uiverse="satyamchaudharydev/itchy-chipmunk-95" key={s.title}>
              <p>“{s.text}”</p>
              <span>
                <s.icon />
                {s.title}
                <small>Example request · {s.category}</small>
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="reference-frontier site-container">
        <h2>From the first idea to the next iteration</h2>
        <div>
          {[
            {
              title: "Create something new",
              body: "Start with an interface, a mechanic or an area. Use an example request or describe your own.",
              link: "Explore prompts →",
              href: "/app/library",
            },
            {
              title: "Improve an existing project",
              body: "Bring the place you already have. Make a focused change with the original context close by.",
              link: "Open your projects →",
              href: "/app/projects",
            },
            {
              title: "Stay in control",
              body: "Check the connection, choose edit access and review what changed before moving forward.",
              link: "Read the setup guide →",
              href: "/docs#pair",
            },
          ].map((f) => (
            <article data-uiverse="satyamchaudharydev/itchy-chipmunk-95" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <Link href={f.href}>{f.link}</Link>
              <div className="frontier-preview">
                {f.title === "Create something new" ? (
                  <>
                    <span>
                      Agent <small>Roblox Studio</small>
                    </span>
                    <span>Plan a coin collection loop</span>
                    <span>Build an egg shop</span>
                    <span>Review a daily reward screen</span>
                  </>
                ) : f.title === "Improve an existing project" ? (
                  <>
                    <span>
                      Project history <small>Workspace</small>
                    </span>
                    <span>Continue a conversation →</span>
                    <span>Review the previous changes</span>
                    <span>Ask for a focused edit</span>
                  </>
                ) : (
                  <>
                    <span>
                      Studio connection <small>Plugin</small>
                    </span>
                    <span>Pair with a six-character code</span>
                    <span>Choose when edits are enabled</span>
                    <span>Review a checkpoint</span>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="reference-notes site-container">
        <h2>Getting started</h2>
        <div>
          {[
            {
              title: "Pair your Studio project",
              tag: "Studio",
              href: "/docs#pair",
            },
            {
              title: "Describe your first build",
              tag: "Create",
              href: "/app/library",
            },
            {
              title: "Understand credits",
              tag: "Account",
              href: "/docs#credits",
            },
            {
              title: "Pick up an existing conversation",
              tag: "Projects",
              href: "/app/projects",
            },
          ].map((x) => (
            <Link key={x.title} href={x.href}>
              <span>{x.tag}</span>
              {x.title}
            </Link>
          ))}
        </div>
      </section>
      <section className="reference-studio-band site-container">
        <div>
          <h2>Your game stays in Roblox Studio.</h2>
          <p>
            Use the conversation to direct the work, and your own place to see
            the result.
          </p>
          <Link href="/docs#pair">Get connected →</Link>
        </div>
        <StudioDemo variant="code" />
      </section>
    </>
  );
}
