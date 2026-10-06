"use client";

// Design review only. Renders the real signed-in screens with made-up data so they can be looked at
// without a session or the worker. It is reachable only in `next dev` (the page 404s in a build and
// the middleware does not open /dev/ in one).
import type { FlueConversationMessage } from "@flue/sdk";
import { useState } from "react";
import { AppShell } from "./app-shell";
import { ChatScreen } from "./chat-view";
import { NewChat } from "./new-chat";

const NOW = Date.now();
const PROJECTS = [
  "Egg shop screen",
  "Main menu with Play and Shop",
  "Daily rewards, seven days",
  "Coin counter and pickups",
  "Park props near spawn",
  "Market area with two stalls",
  "Gamepasses window",
  "Pet shop path",
].map((name, i) => ({
  id: `demo-${i}`,
  name,
  updated_at: new Date(NOW - i * 3_600_000).toISOString(),
  last_activity_at: null,
}));

let installed = false;
function installMock(studio: "on" | "off") {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  const real = window.fetch.bind(window);
  const json = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      })
    );
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rest/v1/projects")) {
      return json(url.includes("id=eq.") ? PROJECTS[0] : PROJECTS);
    }
    if (url.includes("/api/me")) {
      return json({ quota: { allowanceRemaining: 4.2 * 150, credits: 0, unmetered: false } });
    }
    if (url.includes("/studio/diagnostics")) {
      return json({ link: { paired: studio === "on", connected: studio === "on" } });
    }
    if (url.includes("/checkpoints")) {
      return json({
        checkpoints: [{ id: "c1", label: "before StudPilot Studio changes", createdAt: NOW - 120_000 }],
      });
    }
    if (url.includes("/pairing")) {
      return json({ code: "K7M3QP", expiresAtIso: new Date(NOW + 600_000).toISOString() });
    }
    return real(input, init);
  };
}

const msg = (id: string, role: "user" | "assistant", parts: unknown[]) =>
  ({ id, role, purpose: role, display: "visible", parts }) as unknown as FlueConversationMessage;

const SAMPLE: FlueConversationMessage[] = [
  msg("u1", "user", [{ type: "text", text: "Build an egg shop screen with a featured egg and five more eggs, each with a Buy button", state: "done" }]),
  msg("a1", "assistant", [
    { type: "reasoning", text: "The place has a ScreenGui for the HUD. I will add a new ScreenGui for the shop and keep the HUD untouched.", state: "done" },
    {
      type: "dynamic-tool",
      toolName: "inspect_place",
      toolCallId: "t1",
      state: "output-available",
      input: { path: "StarterGui" },
      output: { children: ["HudGui"] },
    },
    {
      type: "dynamic-tool",
      toolName: "task",
      toolCallId: "t2",
      state: "input-available",
      input: { agent: "ui-builder", prompt: "Create EggShopGui with a header, a featured egg row and a grid of five eggs" },
    },
    {
      type: "dynamic-tool",
      toolName: "create_instances",
      toolCallId: "t3",
      state: "output-available",
      input: { parent: "StarterGui", class: "ScreenGui", name: "EggShopGui" },
      output: { ok: true },
    },
    {
      type: "text",
      text: "I added **EggShopGui** with a header, one featured egg and five more eggs in a grid. Each card has a price and a Buy button.\n\nTwo things are still open:\n\n- The Buy buttons are not connected to your currency yet.\n- The egg pictures are placeholders.",
      state: "streaming",
    },
  ]),
];

export function DevPreview({ view, studio }: { view: string; studio: "on" | "off" }) {
  // Installed in render, before any child effect runs, so the first requests are already answered.
  useState(() => installMock(studio));
  return (
    <AppShell>
      {view === "chat" || view === "pair" ? (
        <ChatScreen
          busy={true}
          error={null}
          messages={SAMPLE}
          onSend={() => undefined}
          pair={view === "pair"}
          projectId="demo-0"
          ready
          title="Egg shop screen"
        />
      ) : (
        <NewChat />
      )}
    </AppShell>
  );
}
