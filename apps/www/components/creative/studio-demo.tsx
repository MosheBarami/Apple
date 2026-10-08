"use client";
import {
  ArrowUpIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileIcon,
  PanelRightIcon,
  RefreshCwIcon,
  LoaderCircleIcon,
  PlugIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
const TASKS = [
  "Build an egg shop",
  "Plan a coin collection loop",
  "Add a main menu",
  "Improve the spawn area",
  "Review a daily rewards screen",
];
const STEPS = [
  "Read project context",
  "Prepare a checkpoint",
  "Create the example interface",
  "Example ready for review",
];
const CODE = [
  "-- Shop.client.luau",
  "local shop = script.Parent",
  "local selectedItem = nil",
  "",
  "local function selectItem(item)",
  "    selectedItem = item",
  "    shop.Details.Title.Text = item.Name",
  "end",
  "",
  "-- Connect purchases to your game economy",
  "-- after choosing the currency and prices.",
];
export function StudioDemo({
  large = false,
  autoPlay = false,
  variant = "shop",
}: {
  large?: boolean;
  autoPlay?: boolean;
  variant?: "shop" | "code" | "activity" | "connection";
}) {
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [request, setRequest] = useState(
    "Build an egg shop with three eggs and a Buy button"
  );
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (
      !autoPlay ||
      !root.current ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !started.current) {
          started.current = true;
          setStep(0);
          setRunning(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [autoPlay]);
  const [task, setTask] = useState(0);
  const [view, setView] = useState<"preview" | "code">(
    variant === "code" ? "code" : "preview"
  );
  const [mode, setMode] = useState("Build");
  const [gems, setGems] = useState(320);
  const [owned, setOwned] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [written, setWritten] = useState(0);
  const [runMode, setRunMode] = useState("Build");
  const steps =
    runMode === "Inspect"
      ? [
          "Read example context",
          "Inspect the example source",
          "Review the shop interaction",
          "Example review ready",
        ]
      : STEPS;
  const reply =
    runMode === "Inspect"
      ? "The sample shop tracks gems and owned items locally. Its purchases need a server-side economy in a real game. No Studio changes were made by this demonstration."
      : "The example interface is ready. Purchases in this demonstration use local sample state. Connect your own project to build in Studio.";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () =>
        setStep((s) => {
          if (s >= 3) {
            setRunning(false);
            return s;
          }
          return s + 1;
        }),
      750
    );
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (step !== 3) return;
    const timer = setInterval(
      () =>
        setWritten((n) => {
          if (n >= reply.length) {
            clearInterval(timer);
            return n;
          }
          return Math.min(n + 4, reply.length);
        }),
      24
    );
    return () => clearInterval(timer);
  }, [step, reply]);
  const run = () => {
    if (!request.trim()) return;
    setRunMode(mode);
    if (mode === "Inspect") setView("code");
    setStep(0);
    setWritten(0);
    setRunning(true);
  };
  const choose = (i: number) => {
    setTask(i);
    setRequest(TASKS[i]);
    setStep(-1);
    setRunning(false);
    setWritten(0);
  };
  const buy = (name: string, cost: number) => {
    if (owned.includes(name)) {
      setNote(`${name} is already owned in the example.`);
      return;
    }
    if (gems < cost) {
      setNote("Not enough gems in the example.");
      return;
    }
    setGems((n) => n - cost);
    setOwned((v) => [...v, name]);
    setNote(`${name} added to the sample inventory.`);
  };
  return (
    <div
      className={`reference-window ${large ? "window-large" : ""} demo-${variant}`}
      ref={root}
      data-testid="studio-demo"
    >
      <div className="window-chrome">
        <span className="window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>StudPilot Workspace · Example</span>
        <button type="button" aria-label="Restart example" onClick={run}>
          <RefreshCwIcon />
        </button>
      </div>
      <div className="window-layout">
        <aside className="window-projects">
          <div className="window-group-label">EXAMPLE PROJECTS</div>
          {TASKS.map((name, i) => (
            <button
              type="button"
              key={name}
              className={task === i ? "selected" : ""}
              onClick={() => choose(i)}
            >
              {i === task && running ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <CheckCircle2Icon />
              )}
              <span>
                {name}
                <small>
                  {i === task && running ? steps[step] : "Interactive example"}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <div className="window-conversation">
          <div className="window-task-title">
            {variant === "connection" ? "Connect Studio" : TASKS[task]}
          </div>
          <div className="demo-request-message">{request}</div>
          <div className="demo-reading">
            {step < 0
              ? "Ready when you are."
              : steps.slice(0, step + 1).map((s, i) => (
                  <div key={s}>
                    {i === step && running ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <CheckCircle2Icon />
                    )}
                    {s}
                  </div>
                ))}
          </div>
          {step === 3 ? (
            <>
              <div className="demo-change-row">
                <FileIcon />
                Shop.client.luau<span>+ example</span>
              </div>
              <p className="demo-reply" role="status">
                {reply.slice(0, written)}
                {written < reply.length ? (
                  <span className="type-cursor" />
                ) : null}
              </p>
            </>
          ) : (
            <p className="demo-reply">
              Describe what your game needs. Review the changes, then ask for
              the next edit.
            </p>
          )}
          <form
            className="demo-composer"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <textarea
              aria-label="Demo request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={2}
            />
            <div>
              <label>
                <select
                  aria-label="Demo mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option>Build</option>
                  <option>Inspect</option>
                </select>
                <ChevronDownIcon />
              </label>
              <span>Studio project</span>
              <button
                type="submit"
                aria-label={running ? "Restart demo" : "Run demo"}
                disabled={!request.trim()}
              >
                {running ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <ArrowUpIcon />
                )}
              </button>
            </div>
          </form>
        </div>
        <div className="window-preview">
          <div className="preview-navigation">
            <span>
              <ArrowLeftIcon />
              <ArrowRightIcon />
              <RefreshCwIcon />
            </span>
            <span>My Roblox project</span>
            <button
              type="button"
              aria-label={
                view === "preview"
                  ? "Show code preview"
                  : "Show interface preview"
              }
              onClick={() =>
                setView((v) => (v === "preview" ? "code" : "preview"))
              }
            >
              <PanelRightIcon />
            </button>
          </div>
          {view === "code" ? (
            <div className="demo-code">
              <div>Shop.client.luau</div>
              {CODE.map((line, i) => (
                <p key={i}>
                  <span>{i + 1}</span>
                  <code>{line || " "}</code>
                </p>
              ))}
            </div>
          ) : variant === "activity" ? (
            <div className="sample-activity">
              <p>Example activity</p>
              <h3>Build an egg shop</h3>
              <p>
                A view of the local demonstration. No Studio work is running
                here.
              </p>
              <div>
                {steps.map((label, i) => (
                  <div key={label} className={step >= i ? "step-returned" : ""}>
                    {step >= i ? (
                      <CheckCircle2Icon />
                    ) : (
                      <span className="activity-idle" />
                    )}
                    <span>{label}</span>
                    <small>{step >= i ? "Example returned" : "Waiting"}</small>
                  </div>
                ))}
              </div>
              <div className="sample-review">
                <FileIcon />
                <span>
                  Shop.client.luau
                  <small>Example source available in the code view</small>
                </span>
                <button type="button" onClick={() => setView("code")}>
                  View source →
                </button>
              </div>
            </div>
          ) : variant === "connection" ? (
            <div className="sample-connection">
              <PlugIcon />
              <h3>Bring your place into the workspace.</h3>
              <p>
                Pair the StudPilot plugin with your project. Connection and edit
                access remain under your control.
              </p>
              <div>
                <span>Example pairing code</span>
                <code>K7M3QP</code>
                <small>
                  Illustration only · this code will not connect a real place.
                </small>
              </div>
              <ol>
                <li>Open your place in Studio.</li>
                <li>Open the StudPilot plugin.</li>
                <li>Get a fresh code from your project.</li>
                <li>Choose when to enable edits.</li>
              </ol>
              <a href="/docs#pair">Open the setup guide →</a>
            </div>
          ) : (
            <div className="sample-place">
              <div className="sample-place-label">StarterGui / EggShopGui</div>
              <div className="sample-shop">
                <div>
                  <h3>Egg shop</h3>
                  <span>{gems} gems</span>
                </div>
                <p>Choose your next companion.</p>
                <div className="sample-items">
                  {[
                    { name: "Forest egg", cost: 80 },
                    { name: "Golden egg", cost: 120 },
                    { name: "Crystal egg", cost: 450 },
                  ].map((item, i) => (
                    <button
                      type="button"
                      key={item.name}
                      onClick={() => buy(item.name, item.cost)}
                    >
                      <span className={`sample-egg egg-${i}`} />
                      <strong>{item.name}</strong>
                      <small>
                        {owned.includes(item.name)
                          ? "Owned"
                          : `${item.cost} gems`}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="sample-note" role="status">
                  {note || "Sample interface · local demo state"}
                </p>
              </div>
              <div className="sample-place-footer">
                <span>Workspace</span>
                <span>StarterGui</span>
                <span>Scripts</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
