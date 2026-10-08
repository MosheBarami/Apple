"use client";
import { useRef, useState } from "react";
import { UiverseAction } from "@/components/uiverse/elements";
import { AssemblyScene } from "@/components/creative/assembly-scene";
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
        <div className="assembly-hero-layout">
          <div className="assembly-hero-copy">
            <div className="hero-overline">
              <span /> YOUR IMAGINATION. INSIDE ROBLOX STUDIO.
            </div>
            <h1>
              Your next world
              <br />
              starts with
              <br />
              <span className="luminous-text">a little idea.</span>
            </h1>
            <p className="hero-description">
              Build the interface. Shape the world. Make the mechanic work.
              <br className="hidden sm:block" /> Your creative partner,
              connected to your Roblox Studio.
            </p>
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
            <p className="hero-beta-note">
              Private beta · Free to explore · Built for Roblox creators
            </p>
          </div>
          <AssemblyScene compact />
        </div>
        <div className="demo-section-heading">
          <span>FROM YOUR WORDS TO YOUR WORKSPACE</span>
          <h2>See the idea take shape.</h2>
          <p>Try the interactive example. Then bring your own project.</p>
        </div>
        <div className="hero-stage">
          <div className="stage-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>

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
