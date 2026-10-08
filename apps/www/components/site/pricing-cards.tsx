"use client";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CoinsIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { PLANS } from "@/lib/site-data";
export function PricingCards() {
  const [view, setView] = useState<"plans" | "packs">("plans");
  const reduce = useReducedMotion();
  const [compare, setCompare] = useState(false);
  const plans = PLANS.filter((p) =>
    view === "packs" ? p.id === "topup" : p.id !== "topup"
  );
  return (
    <div>
      <div className="pricing-switch" role="group" aria-label="Pricing options">
        {(
          [
            { id: "plans", label: "Monthly plans" },
            { id: "packs", label: "Credit packs" },
          ] as const
        ).map((v) => (
          <button
            type="button"
            key={v.id}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {view === v.id ? (
              <motion.span
                layoutId="pricing-choice"
                className="selection-glass"
                transition={{ duration: reduce ? 0 : 0.2 }}
              />
            ) : null}
            {v.label}
            {v.id === "packs" ? <CoinsIcon className="size-3.5" /> : null}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{
            opacity: 0,
            transform: reduce ? "none" : "translateY(10px)",
          }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transform: reduce ? "none" : "translateY(-6px)" }}
          transition={{ duration: 0.2 }}
          className={`pricing-grid ${view === "packs" ? "packs-grid" : ""}`}
        >
          {plans.map((p) => (
            <article
              key={p.id}
              className={`price-panel luminous-panel ${p.id === "pro" ? "is-featured" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="price-plan-name">{p.name}</span>
                {p.id === "pro" ? (
                  <span className="plan-tag">
                    <SparklesIcon className="size-3" />
                    More room to create
                  </span>
                ) : null}
              </div>
              <p className="price-value">
                {p.price}
                <span>{p.unit || "to start"}</span>
              </p>
              <p className="price-description">{p.blurb}</p>
              <div className="price-credit">
                <CoinsIcon className="size-4" />
                <strong>{p.credits}</strong>
                <span>{p.creditsNote}</span>
              </div>
              {p.id === "free" ? (
                <Link href="/login" className="studio-button">
                  <span>Start building free</span>
                  <ArrowUpRightIcon className="size-4" />
                </Link>
              ) : (
                <button type="button" disabled className="glass-button w-full">
                  Available after beta
                </button>
              )}
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              {p.id !== "free" ? (
                <p className="price-status">Not available for purchase yet</p>
              ) : null}
            </article>
          ))}
        </motion.div>
      </AnimatePresence>
      <button
        type="button"
        className="compare-trigger"
        aria-expanded={compare}
        onClick={() => setCompare((v) => !v)}
      >
        {compare ? "Hide" : "Compare"} plan details
        <span>{compare ? "−" : "+"}</span>
      </button>
      <AnimatePresence>
        {compare ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
            className="plan-comparison"
          >
            <div>
              <span>Plan</span>
              <b>Free</b>
              <b>Pro</b>
              <b>Max</b>
            </div>
            <div>
              <span>Credits</span>
              <span>5/day · max 30/month</span>
              <span>100/month</span>
              <span>300/month</span>
            </div>
            <div>
              <span>Access today</span>
              <span>Beta</span>
              <span>Planned</span>
              <span>Planned</span>
            </div>
            <div>
              <span>Billing</span>
              <span>No card</span>
              <span>$9.99/month</span>
              <span>$24.99/month</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
