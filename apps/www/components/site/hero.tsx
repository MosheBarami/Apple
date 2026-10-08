"use client";
import { useRef, useState } from "react";
import { UiverseAction } from "@/components/uiverse/elements";
import Image from "next/image";
import { StudioDemo } from "@/components/creative/studio-demo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function Hero() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <section className="reference-hero">
      <div className="site-container">
        <h1>
          StudPilot is your Roblox agent for
          <br />
          building and refining your game.
        </h1>
        <div className="hero-actions">
          <UiverseAction href="/app">Open StudPilot</UiverseAction>
          <button
            type="button"
            ref={trigger}
            className="glass-button"
            onClick={() => setOpen(true)}
          >
            Try a demo →
          </button>
        </div>
        <div className="hero-stage">
          <Image
            src="/art/landscape-cursor.webp"
            width={1800}
            height={1200}
            alt="Painterly mountain landscape behind the StudPilot example workspace"
            className="stage-landscape"
            priority
            sizes="(max-width:700px) 100vw,1300px"
          />
          <div className="hero-product">
            <StudioDemo large autoPlay />
          </div>
          <div className="floating-output">
            <div>
              <span className="window-dots">
                <i />
                <i />
                <i />
              </span>
              <span>StudPilot · Example activity</span>
            </div>
            <p>Preparing a shop interface for review.</p>
            <p>
              <span className="output-bullet">●</span>Read project context
            </p>
            <p>
              <span className="output-bullet">●</span>Keep existing HUD
              unchanged
            </p>
            <p>
              <span className="output-bullet">●</span>Connect to the game’s
              currency next
            </p>
          </div>
        </div>
        <p className="stage-disclosure">
          Interactive example workspace. Builds in your own place run through
          the Studio plugin.
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="demo-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Try the StudPilot workspace</DialogTitle>
            <DialogDescription>
              Choose a task, send a demo request, inspect the code and try the
              sample shop. This example uses local state.
            </DialogDescription>
          </DialogHeader>
          <StudioDemo large />
        </DialogContent>
      </Dialog>
    </section>
  );
}
