"use client";
import { ArrowUpRightIcon, PlayIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AmbientField } from "@/components/creative/experience";
import { StudioDemo } from "@/components/creative/studio-demo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function Hero() {
  const [watch, setWatch] = useState(false);
  return (
    <section className="saas-hero" aria-labelledby="hero-title">
      <AmbientField />
      <div className="hero-layout">
        <div className="hero-copy">
          <div className="release-badge">
            <span className="signal-pulse" />
            YOUR CREATIVE CO-PILOT
            <span className="badge-divider" />
            BETA
          </div>
          <h1 id="hero-title">
            Big ideas.
            <br />
            <span className="gradient-text">
              Meet your
              <br />
              building partner.
            </span>
          </h1>
          <p>
            Your next Roblox creation starts with a conversation. Shape worlds,
            craft interfaces and improve your game — right beside Studio.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="studio-button">
              <span>Start building free</span>
              <ArrowUpRightIcon className="size-4" />
            </Link>
            <button
              type="button"
              className="glass-button"
              onClick={() => setWatch(true)}
            >
              <PlayIcon className="size-4" />
              Watch demo
            </button>
          </div>
          <div className="hero-footnotes">
            <span>
              <CheckIcon />
              No card needed
            </span>
            <span>
              <CheckIcon />
              Your Studio. Your control.
            </span>
          </div>
        </div>
        <div className="hero-preview">
          <div aria-hidden className="preview-halo" />
          <div className="preview-window">
            <StudioDemo />
          </div>
          <div className="floating-note">
            <span className="note-icon">
              <SparklesIcon />
            </span>
            <div>
              <strong>From prompt to possibility</strong>
              <span>An interactive concept preview</span>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={watch} onOpenChange={setWatch}>
        <DialogContent className="demo-dialog">
          <DialogHeader>
            <DialogTitle>Take StudPilot for a spin</DialogTitle>
            <DialogDescription>
              Try the demo request, switch views, or buy an item in the sample
              shop. This is an interactive UI demonstration.
            </DialogDescription>
          </DialogHeader>
          <StudioDemo large />
        </DialogContent>
      </Dialog>
    </section>
  );
}
import { SparklesIcon } from "lucide-react";
