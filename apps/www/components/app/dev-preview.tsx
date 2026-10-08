"use client";

// Design review only (next dev; the page 404s in a build). Renders the real signed-in screens with made-up data:
// the chat is fed a scripted UI message stream through the AI SDK's own reader (readUIMessageStream), so the
// parts reaching ChatScreen are shaped exactly as useAgentChat would hand them over.
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { Suspense, useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { ChatScreen } from "./chat-view";
import { Dashboard } from "./dashboard";
import { SettingsPage } from "./settings";

const NOW = Date.now();
const PROJECTS = [
  ["Sky Obby", "Sky Obby (Published)"],
  ["Pet Simulator remake", "PetSim_v3"],
  ["Tycoon test place", null],
  ["Racing prototype", "Kart Racing"],
  ["Halloween event", "Main Game"],
  ["Lobby redesign", "Lobby"],
  ["Daily rewards", null],
].map(([name, place], i) => ({
  id: `demo-${i}`,
  last_activity_at: new Date(NOW - (i * 7 + 1) * 3_600_000).toISOString(),
  name,
  place_name: place,
  updated_at: new Date(NOW - i * 3_600_000).toISOString(),
}));

let installed = false;
function installMock(empty: boolean) {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  try {
    localStorage.setItem(
      "studpilot:last-outcome",
      JSON.stringify({
        "demo-0": { at: NOW, outcome: "finished" },
        "demo-1": { at: NOW, outcome: "stopped" },
        "demo-3": { at: NOW, outcome: "failed" },
      })
    );
  } catch {}
  const real = window.fetch.bind(window);
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rest/v1/projects")) {
      return json(url.includes("id=eq.") ? PROJECTS[0] : empty ? [] : PROJECTS);
    }
    if (url.includes("/api/me")) {
      const u = 150;
      return json({
        email: "builder@example.com",
        quota: {
          allowanceRemaining: 29.55 * u,
          credits: 666_512.95 * u,
          creditsDaily: 50 * u,
          creditsMonthly: 0,
          creditsUsedThisMonth: 310.2 * u,
          creditsUsedToday: 20.45 * u,
          plan: "builder",
          resetsAtIso: new Date(NOW + 5 * 3_600_000).toISOString(),
        },
      });
    }
    if (/\/api\/projects\/[^/]+\/connect$/.test(url)) {
      return json({ placeName: "Sky Obby (Published)", status: "connected" });
    }
    if (url.includes("/studio/diagnostics")) {
      const on = url.includes("demo-0") || url.includes("demo-1");
      return json({ link: { connected: url.includes("demo-0"), paired: on } });
    }
    return real(input, init);
  };
}

const DOCS = [
  { title: "UIListLayout", url: "https://create.roblox.com/docs/reference/engine/classes/UIListLayout" },
  { title: "Position and size UI objects", url: "https://create.roblox.com/docs/ui/position-and-size" },
  { title: "UISizeConstraint", url: "https://create.roblox.com/docs/reference/engine/classes/UISizeConstraint" },
];

const REASONING =
  "The request is a shop screen with three items and a Buy button each, and it has to work on phone. First I need to see what is already in StarterGui so I do not collide with the HUD. Then I should check how UIListLayout handles padding and wrapping, because three cards side by side will not fit a 390px wide phone. A vertical list on narrow screens and a row on wide ones is the usual answer; a UISizeConstraint on each card keeps them readable. The purchase itself belongs on the server: a RemoteFunction that checks the price against leaderstats before granting the item.\n\nFor the cards themselves: a frame per item with an icon, the name, the price and the Buy button underneath. Text has to stay readable at the smallest phone size, so TextScaled with a UITextSizeConstraint rather than a fixed TextSize. Padding goes in a UIPadding on the list container, not on each card, so the spacing stays even when the list wraps. After building it I will measure the result at phone and desktop sizes and fix any label that does not fit, then play-test a purchase to make sure the Coins go down and the item is granted only once.";

const FINAL = `I added **ShopUI** with three item cards, each with a price and a Buy button, and wired the purchase on the server.

- \`StarterGui/ShopUI\` stacks the cards vertically on phones and lays them in a row on wider screens, using a \`UIListLayout\` with \`Wraps\` [1] and a \`UISizeConstraint\` so a card never grows past 320 px [3].
- \`ServerScriptService/ShopService\` checks the price against the player's Coins before granting the item:

\`\`\`lua
BuyItem.OnServerInvoke = function(player, itemId)
\tlocal item = Items[itemId]
\tlocal coins = player.leaderstats.Coins
\tif not item or coins.Value < item.Price then
\t\treturn false
\tend
\tcoins.Value -= item.Price
\treturn true
end
\`\`\`

I checked the layout at phone and desktop sizes: nothing overflows and every label fits. A play-test bought the first item and the Coins went down by 50. The item icons are placeholders until you pick your own [2].`;

type Step = UIMessageChunk | { pause: number } | "hold";

function script(phase: string): Step[] {
  const words = (text: string) => text.split(/(?<= )/);
  const out: Step[] = [{ messageId: "a1", messageMetadata: { startedAt: Date.now() }, type: "start" }, { type: "start-step" }];
  out.push({ id: "r1", type: "reasoning-start" });
  for (const w of words(REASONING)) {
    out.push({ delta: w, id: "r1", type: "reasoning-delta" }, { pause: 45 });
  }
  out.push({ id: "r1", type: "reasoning-end" });
  const tool = (id: string, toolName: string, input: unknown, output: unknown, wait = 700): Step[] => [
    { toolCallId: id, toolName, type: "tool-input-start" },
    { input, toolCallId: id, toolName, type: "tool-input-available" },
    { pause: wait },
    { output, toolCallId: id, type: "tool-output-available" },
  ];
  out.push(...tool("t1", "get_project_tree", { root: "StarterGui" }, { children: ["HUD", "Leaderboard"] }));
  out.push({ data: { remaining: 666_541.6 }, type: "data-credits" });
  out.push({ toolCallId: "t2", toolName: "search_docs", type: "tool-input-start" });
  out.push({ input: { query: "UIListLayout" }, toolCallId: "t2", toolName: "search_docs", type: "tool-input-available" });
  out.push({ pause: 500 });
  DOCS.forEach((d, i) => out.push({ sourceId: `s${i}`, title: d.title, type: "source-url", url: d.url }, { pause: 200 }));
  out.push({ output: { results: DOCS }, toolCallId: "t2", type: "tool-output-available" });
  out.push({ type: "finish-step" }, { type: "start-step" });
  out.push({ id: "x1", type: "text-start" });
  for (const w of words("The place already has a HUD and a Leaderboard, so the shop goes in its own ScreenGui. ")) {
    out.push({ delta: w, id: "x1", type: "text-delta" }, { pause: 40 });
  }
  out.push({ id: "x1", type: "text-end" });
  out.push(...tool("t3", "build_ui", { name: "ShopUI" }, { created: "StarterGui.ShopUI", nodes: 31 }, 1200));
  out.push({ data: { remaining: 666_539.2 }, type: "data-credits" });
  if (phase === "live") {
    out.push({ toolCallId: "t4", toolName: "check_layout", type: "tool-input-start" });
    out.push({ input: { target: "ShopUI", viewports: ["phone", "desktop"] }, toolCallId: "t4", toolName: "check_layout", type: "tool-input-available" });
    out.push({ data: { label: "Measuring ShopUI at 390 × 844" }, id: "p1", type: "data-progress" });
    out.push("hold");
  }
  out.push(...tool("t4", "check_layout", { target: "ShopUI" }, { defects: [] }, 900));
  out.push(...tool("t5", "edit_script", { path: "ServerScriptService.ShopService" }, { ok: true }));
  out.push(...tool("t6", "play_check", { seconds: 10 }, { errors: 0 }, 1000));
  out.push({ data: { remaining: 666_537.8 }, type: "data-credits" });
  out.push({ type: "finish-step" }, { type: "start-step" });
  out.push({ id: "x2", type: "text-start" });
  for (const w of words(FINAL)) {
    out.push({ delta: w, id: "x2", type: "text-delta" }, { pause: 18 });
  }
  out.push({ id: "x2", type: "text-end" }, { type: "finish-step" });
  out.push(
    phase === "done"
      ? { messageMetadata: { finishedAt: Date.now() + 72_000, startedAt: Date.now() }, type: "finish" }
      : { type: "finish" }
  );
  return out;
}

const USER: UIMessage = {
  id: "u1",
  parts: [{ text: "Add a shop screen with three items and a Buy button on each. It should work on phone too.", type: "text" }],
  role: "user",
};

/** Plays the script through readUIMessageStream; `instant` skips the pauses (the finished view). */
function useFakeTurn(phase: string) {
  const [messages, setMessages] = useState<UIMessage[]>([USER]);
  const [busy, setBusy] = useState(true);
  const stop = useRef(false);
  useEffect(() => {
    const instant = phase === "done";
    const steps = script(phase);
    let release: (() => void) | null = null;
    const stream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        for (const s of steps) {
          if (stop.current) {
            break;
          }
          if (s === "hold") {
            await new Promise<void>((r) => {
              release = r;
            });
          } else if ("pause" in s) {
            if (!instant) {
              await new Promise((r) => setTimeout(r, s.pause));
            }
          } else {
            controller.enqueue(s);
          }
        }
        controller.close();
      },
    });
    (async () => {
      for await (const m of readUIMessageStream<UIMessage>({ stream })) {
        setMessages([USER, m]);
      }
      setBusy(false);
    })();
    return () => {
      stop.current = true;
      release?.();
    };
  }, [phase]);
  return {
    busy,
    messages,
    stop: () => {
      stop.current = true;
    },
  };
}

function FakeChat({ phase }: { phase: string }) {
  const turn = useFakeTurn(phase);
  return (
    <ChatScreen
      busy={turn.busy}
      error={null}
      messages={turn.messages}
      onSend={() => undefined}
      onStop={turn.stop}
      projectId="demo-0"
      title="Sky Obby"
    />
  );
}

export function DevPreview({ view, phase }: { view: string; phase: string }) {
  useState(() => installMock(view === "dashboard-empty"));
  return (
    <AppShell>
      {view === "settings" ? (
        <SettingsPage />
      ) : view === "chat" ? (
        <FakeChat phase={phase} />
      ) : view === "chat-empty" ? (
        <ChatScreen busy={false} error={null} messages={[]} onSend={() => undefined} projectId="demo-0" title="Sky Obby" />
      ) : (
        <Suspense>
          <Dashboard />
        </Suspense>
      )}
    </AppShell>
  );
}
