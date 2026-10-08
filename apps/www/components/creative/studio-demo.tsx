"use client";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  LayersIcon,
  Maximize2Icon,
  MousePointer2Icon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  ShoppingBagIcon,
  BoxIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LogoMark } from "@/components/site/logo";

const STEPS = [
  "Understanding your idea",
  "Preparing the scene",
  "Adding the interface",
  "Preview ready",
];
const REPLY =
  "Your floating island concept is ready to explore. Add a shop, reshape the world, or keep refining your idea.";
/** An explicitly labelled interactive UI demonstration. It never calls the AI or changes a real place. */
export function StudioDemo({ large = false }: { large?: boolean }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"world" | "interface">("world");
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState(
    "Create a floating island with a portal and a shop"
  );
  const [written, setWritten] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [gems, setGems] = useState(320);
  const [owned, setOwned] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting)
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!running || !visible) return;
    const timer = setInterval(
      () =>
        setStep((s) => {
          if (s >= 3) {
            setRunning(false);
            return s;
          }
          return s + 1;
        }),
      900
    );
    return () => clearInterval(timer);
  }, [running, visible]);
  useEffect(() => {
    if (step < 3 || !visible) return;
    const timer = setInterval(
      () =>
        setWritten((n) => {
          if (n >= REPLY.length) {
            clearInterval(timer);
            return n;
          }
          return Math.min(n + 3, REPLY.length);
        }),
      22
    );
    return () => clearInterval(timer);
  }, [step, visible]);
  const build = () => {
    if (!text.trim()) return;
    setStep(0);
    setWritten(0);
    setRunning(true);
    setNote("");
  };
  const buy = (name: string, cost: number) => {
    if (owned.includes(name)) {
      setNote(`${name} is already in your demo inventory.`);
      return;
    }
    if (gems < cost) {
      setNote("Not enough gems in the demo.");
      return;
    }
    setGems((n) => n - cost);
    setOwned((v) => [...v, name]);
    setNote(`${name} added to your demo inventory.`);
  };
  return (
    <div
      ref={root}
      className={`studio-demo luminous-panel ${large ? "demo-large" : ""}`}
      data-testid="studio-demo"
      data-visible={visible}
    >
      <div className="demo-toolbar">
        <div className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span className="font-medium">Untitled world</span>
          <ChevronDownIcon className="size-3 opacity-40" />
        </div>
        <span className="demo-label">
          <span />
          Interactive demo
        </span>
      </div>
      <div className="demo-body">
        <aside className="demo-rail" aria-label="Preview layers">
          <button
            type="button"
            aria-label="Show world preview"
            aria-pressed={mode === "world"}
            onClick={() => setMode("world")}
          >
            <BoxIcon />
          </button>
          <button
            type="button"
            aria-label="Show interface preview"
            aria-pressed={mode === "interface"}
            onClick={() => setMode("interface")}
          >
            <LayersIcon />
          </button>
          <span />
          <MousePointer2Icon />
        </aside>
        <div className={`demo-scene ${playing ? "is-playing" : ""}`}>
          <Image
            src="/art/creation-world.webp"
            width={1600}
            height={900}
            alt="Original concept illustration of a floating island with a luminous portal"
            priority
            className="world-art"
            sizes="(max-width: 640px) 90vw, (max-width: 900px) 580px, 620px"
          />
          <div className="scene-grid" aria-hidden />
          <div className="scene-beam" aria-hidden />
          <div className="demo-view-tools">
            <span>{mode === "world" ? "WORLD VIEW" : "INTERFACE VIEW"}</span>
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-label={playing ? "Pause scene motion" : "Play scene motion"}
              className={playing ? "active" : ""}
            >
              <PlayIcon className="size-3" />
              {playing ? "Playing" : "Play"}
            </button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{
                opacity: 0,
                transform: reduce ? "none" : "translateY(8px)",
              }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="demo-overlay"
            >
              {mode === "interface" ? (
                <div className="demo-shop">
                  <div className="flex items-center justify-between">
                    <span>
                      <ShoppingBagIcon className="inline size-4" /> Portal shop
                    </span>
                    <b>{gems} gems</b>
                  </div>
                  <div className="demo-shop-items">
                    {[
                      { name: "Crystal", cost: 80 },
                      { name: "Wing", cost: 120 },
                      { name: "Crown", cost: 450 },
                    ].map((item, i) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => buy(item.name, item.cost)}
                        className={`demo-item demo-item-${i}`}
                      >
                        <span className="item-art">
                          {i === 0 ? "◆" : i === 1 ? "✦" : "♜"}
                        </span>
                        <strong>{item.name}</strong>
                        <span>
                          {owned.includes(item.name)
                            ? "Owned"
                            : `${item.cost} gems`}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p role="status">
                    {note ||
                      "Try a purchase. This demo has its own local state."}
                  </p>
                </div>
              ) : (
                <div className="world-coordinate">
                  <span className="crosshair" />
                  <span>
                    Floating island
                    <br />
                    <small>Concept illustration</small>
                  </span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="scene-caption">
            <Maximize2Icon className="size-3" />
            Concept art · UI demonstration
          </div>
        </div>
      </div>
      <div className="demo-agent">
        <div className="demo-avatar">
          <SparklesIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <b>StudPilot</b>
            <span className="text-[10px] text-muted-foreground">
              {running
                ? "DEMO RUNNING"
                : step === 3
                  ? "DEMO COMPLETE"
                  : "READY TO EXPLORE"}
            </span>
          </div>
          <div className="demo-progress" aria-label="Demo progress">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={i <= step ? "reached" : ""}
                style={{ transitionDelay: `${i * 45}ms` }}
              />
            ))}
          </div>
          <p role="status" className={running ? "shimmer-text" : ""}>
            {step === 3
              ? REPLY.slice(0, written)
              : step < 0
                ? "Try a request, or switch to the interface preview."
                : STEPS[step]}
            {step === 3 && written < REPLY.length ? (
              <span className="type-cursor" />
            ) : null}
          </p>
        </div>
      </div>
      <form
        className="demo-input"
        onSubmit={(e) => {
          e.preventDefault();
          build();
        }}
      >
        <input
          aria-label="Demo request"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your idea…"
        />
        <button
          aria-label={running ? "Restart demo" : "Run demo"}
          type="submit"
          disabled={!text.trim()}
        >
          {running ? (
            <RotateCcwIcon className="size-4" />
          ) : (
            <ArrowUpIcon className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}
