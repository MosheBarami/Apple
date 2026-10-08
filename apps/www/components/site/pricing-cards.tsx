"use client";
import { useState } from "react";
import Link from "next/link";
import { PLANS } from "@/lib/site-data";
export function PricingCards() {
  const [yearly, setYearly] = useState(false);
  const [compare, setCompare] = useState(false);
  return (
    <>
      <div className="pricing-switch" role="group" aria-label="Pricing view">
        <button
          type="button"
          aria-pressed={!yearly}
          onClick={() => setYearly(false)}
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={yearly}
          onClick={() => setYearly(true)}
        >
          Yearly totals
        </button>
      </div>
      <div className="pricing-grid">
        {PLANS.map((p) => {
          const recurring = p.id === "pro" || p.id === "max";
          const price =
            yearly && recurring
              ? `$${(Number(p.price.slice(1)) * 12).toFixed(2)}`
              : p.price;
          return (
            <article key={p.id} className="price-panel">
              <h2>{p.name}</h2>
              <p className="plan-subtitle">{p.blurb}</p>
              <p className="price-value">
                {p.id === "free" ? "Free" : price}
                <span>
                  {p.id === "topup"
                    ? "/once"
                    : p.id === "free"
                      ? ""
                      : yearly
                        ? "/12 months"
                        : "/mo."}
                </span>
              </p>
              <div className="plan-credit-label">
                {p.credits}
                <small>{p.creditsNote}</small>
              </div>
              <div className="plan-includes">Includes:</div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <span>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {p.id === "free" ? (
                <Link href="/app" className="studio-button">
                  Try StudPilot
                </Link>
              ) : (
                <div className="planned-plan-button">Available after beta</div>
              )}
            </article>
          );
        })}
      </div>
      <p className="pricing-note">
        {yearly
          ? "Yearly totals show 12 months at the monthly rate. Annual billing is not available."
          : "Paid plans and top-ups are planned. Checkout is closed during beta."}
      </p>
      <button
        type="button"
        className="compare-trigger"
        aria-expanded={compare}
        onClick={() => setCompare((v) => !v)}
      >
        {compare ? "Hide" : "Compare"} plan details {compare ? "↑" : "↓"}
      </button>
      {compare ? (
        <div className="plan-comparison">
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
            <span>Availability</span>
            <span>Beta</span>
            <span>Planned</span>
            <span>Planned</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
