"use client";

import {
  ArrowUpRightIcon,
  BoxIcon,
  Layers3Icon,
  SparklesIcon,
} from "lucide-react";
import { useId, useState } from "react";

const LAYERS = [
  {
    id: "world",
    label: "World",
    icon: BoxIcon,
    title: "A little world. A big beginning.",
    detail: "Floating islands, a quiet forest, somewhere to explore.",
    prompt:
      "Create a small floating island near spawn with pine trees, a stone path and a glowing portal. Keep the spawn clear.",
  },
  {
    id: "interface",
    label: "Interface",
    icon: Layers3Icon,
    title: "Make every interaction feel right.",
    detail: "A clear inventory, useful feedback, a little personality.",
    prompt:
      "Create a compact inventory panel with three item slots, clear selection feedback and a close button. Make it fit on mobile.",
  },
  {
    id: "mechanic",
    label: "Mechanic",
    icon: SparklesIcon,
    title: "Give your world something to do.",
    detail: "Collect a crystal. See the counter respond. Keep creating.",
    prompt:
      "Add collectible crystals with a counter that updates on pickup and prevents collecting the same crystal twice. Check the existing currency first.",
  },
] as const;

/** Original vector artwork. A concept selector, never a report of Studio work. */
export function AssemblyScene({
  onPick,
  compact = false,
}: {
  onPick?: (prompt: string) => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const uid = useId().replaceAll(":", "");
  const layer = LAYERS[selected];
  const paint = (name: string) => `url(#${uid}-${name})`;
  return (
    <section
      className={`assembly-scene ${compact ? "assembly-compact" : ""}`}
      data-layer={layer.id}
      aria-label="Interactive creation concept"
    >
      <div className="assembly-caption">
        <span className="assembly-marker" /> CONCEPT EXPLORER{" "}
        <small>Illustration · not a live build</small>
      </div>
      <div className="assembly-art">
        <svg
          viewBox="0 0 640 480"
          role="img"
          aria-label={`${layer.label} concept: floating forest islands, a luminous portal and game interface`}
        >
          <defs>
            <linearGradient id={`${uid}-top`} x2="0.8" y2="1">
              <stop stopColor="#477d8b" />
              <stop offset="1" stopColor="#193e54" />
            </linearGradient>
            <linearGradient id={`${uid}-side`} x2="0.3" y2="1">
              <stop stopColor="#233c55" />
              <stop offset="1" stopColor="#0b1424" />
            </linearGradient>
            <linearGradient id={`${uid}-portal`} x2="1" y2="1">
              <stop stopColor="#b5fff0" />
              <stop offset=".5" stopColor="#68d9d6" />
              <stop offset="1" stopColor="#6b93fd" />
            </linearGradient>
            <linearGradient id={`${uid}-tree`} x2="1" y2=".5">
              <stop stopColor="#6bbdaf" />
              <stop offset="1" stopColor="#245768" />
            </linearGradient>
            <linearGradient id={`${uid}-gold`} x2="1" y2="1">
              <stop stopColor="#ffe5b1" />
              <stop offset="1" stopColor="#c18056" />
            </linearGradient>
            <radialGradient id={`${uid}-glow`}>
              <stop stopColor="#4caebd" stopOpacity=".28" />
              <stop offset="1" stopColor="#172944" stopOpacity="0" />
            </radialGradient>
            <filter
              id={`${uid}-shadow`}
              x="-40%"
              y="-40%"
              width="180%"
              height="200%"
            >
              <feDropShadow
                dx="0"
                dy="18"
                stdDeviation="15"
                floodColor="#020510"
                floodOpacity=".65"
              />
            </filter>
            <pattern
              id={`${uid}-grid`}
              width="48"
              height="28"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 14 24 0 48 14 24 28Z"
                fill="none"
                stroke="#7cb8ce"
                strokeOpacity=".1"
                strokeWidth=".6"
              />
            </pattern>
          </defs>
          <ellipse cx="335" cy="274" rx="306" ry="210" fill={paint("glow")} />
          <path d="M20 286 322 113 628 286 322 459Z" fill={paint("grid")} />
          <g
            className="assembly-guides"
            fill="none"
            stroke="#6edbce"
            strokeWidth="1"
          >
            <path d="M95 301 318 174 554 309 333 437Z" opacity=".25" />
            <path
              d="M318 174V61M95 301V208M554 309V194"
              strokeDasharray="3 6"
              opacity=".4"
            />
            <ellipse
              cx="332"
              cy="335"
              rx="250"
              ry="104"
              strokeDasharray="2 8"
              opacity=".25"
            />
          </g>
          <g className="assembly-world" filter={paint("shadow")}>
            <path
              d="M144 258 323 155 510 263 332 367Z"
              fill={paint("top")}
              stroke="#6a9d9f"
              strokeWidth="1"
            />
            <path d="M144 258 332 367 332 403 156 303Z" fill={paint("side")} />
            <path d="M332 367 510 263 496 310 332 403Z" fill="#142b40" />
            <path
              d="M169 285 329 378 484 289"
              fill="none"
              stroke="#68d8cd"
              strokeOpacity=".35"
            />
            <path
              d="M207 285 308 227 349 251 262 302 331 342"
              fill="none"
              stroke="#7ca6a3"
              strokeWidth="24"
              strokeLinejoin="round"
            />
            <path
              d="M207 285 308 227 349 251 262 302 331 342"
              fill="none"
              stroke="#c6d4be"
              strokeOpacity=".35"
              strokeWidth="19"
              strokeDasharray="16 3"
            />
            {[
              [212, 233, 1],
              [253, 192, 0.8],
              [427, 267, 1.1],
              [456, 236, 0.7],
              [385, 311, 0.65],
            ].map(([x, y, s], i) => (
              <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
                <path d="M-4 0V-43H5V0L0 3Z" fill="#a6836a" />
                <path d="M0-100 -29-43 0-29 29-43Z" fill={paint("tree")} />
                <path d="M0-100V-29L29-43Z" fill="#24556a" opacity=".6" />
                <path d="M0-115 -22-70 0-59 22-70Z" fill={paint("tree")} />
                <path d="M0-115V-59L22-70Z" fill="#306674" />
              </g>
            ))}
            <g className="assembly-portal">
              <path
                d="M306 234V157Q306 135 328 145L361 164Q373 171 373 187V272"
                fill="#0d2338"
                stroke="#50748f"
                strokeWidth="14"
              />
              <path
                d="M310 237V158Q310 142 328 151L358 168Q367 174 367 189V267"
                fill="#78e6d0"
                fillOpacity=".1"
                stroke={paint("portal")}
                strokeWidth="5"
              />
              <path
                className="portal-shimmer"
                d="M320 183 355 203M320 199 355 219M320 215 355 235"
                stroke="#c1fff0"
                strokeWidth="2"
                opacity=".5"
              />
              <ellipse
                cx="340"
                cy="258"
                rx="39"
                ry="15"
                fill="#74e5cf"
                opacity=".15"
              />
            </g>
            {[
              [191, 274],
              [276, 257],
              [305, 323],
            ].map(([x, y], i) => (
              <g
                key={i}
                className={`assembly-crystal crystal-${i}`}
                transform={`translate(${x} ${y})`}
              >
                <path d="M0-26 9-13 0 0-9-13Z" fill={paint("gold")} />
                <path d="M0-26V0L9-13Z" fill="#edb66e" />
                <ellipse cy="7" rx="11" ry="4" fill="#ffcf91" opacity=".17" />
              </g>
            ))}
            <path d="M89 353 133 328 177 353 133 379Z" fill={paint("top")} />
            <path
              d="M89 353 133 379 177 353 167 378 133 398 98 378Z"
              fill={paint("side")}
            />
            <path d="M475 357 512 336 550 357 512 379Z" fill={paint("top")} />
            <path
              d="M475 357 512 379 550 357 538 377 512 393 489 377Z"
              fill={paint("side")}
            />
          </g>
          <g
            className="assembly-satellite"
            transform="translate(438 93) rotate(8)"
          >
            <rect
              width="111"
              height="48"
              rx="13"
              fill="#152b40"
              stroke="#7fa2c4"
              strokeOpacity=".6"
            />
            <path d="M20 12 29 23 20 34 11 23Z" fill={paint("gold")} />
            <text
              x="39"
              y="30"
              fill="#f4e3c8"
              fontSize="18"
              fontFamily="monospace"
            >
              240
            </text>
          </g>
          <g className="assembly-hud" transform="translate(53 110) rotate(-8)">
            <rect
              width="147"
              height="104"
              rx="14"
              fill="#142237"
              stroke="#8ca6ce"
              strokeOpacity=".55"
            />
            <text
              x="15"
              y="26"
              fill="#d8e7f6"
              fontSize="10"
              fontFamily="monospace"
              letterSpacing="2"
            >
              INVENTORY
            </text>
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${15 + i * 40} 41)`}>
                <rect
                  width="32"
                  height="39"
                  rx="6"
                  fill={i === 0 ? "#24454e" : "#1c3047"}
                  stroke={i === 0 ? "#78e6cf" : "#45627c"}
                />
                <path
                  d="M16 8 23 18 16 29 9 18Z"
                  fill={i === 0 ? paint("portal") : paint("gold")}
                  opacity={1 - i * 0.25}
                />
              </g>
            ))}
            <path
              d="M16 92H78"
              stroke="#486781"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
          <g fill="#b1f3e5" className="assembly-particles">
            <circle cx="242" cy="104" r="2" />
            <circle cx="416" cy="174" r="2" />
            <circle cx="525" cy="246" r="1.5" />
            <circle cx="95" cy="239" r="2" />
            <path d="M381 94v10m-5-5h10" stroke="#99c9e9" />
          </g>
          <path
            className="assembly-beam"
            d="M116 306 332 431 549 306"
            fill="none"
            stroke={paint("portal")}
            strokeWidth="2"
            strokeDasharray="24 600"
          />
        </svg>
        <span className="assembly-coordinate">IMAGINATION → CREATION</span>
      </div>
      <div
        className="assembly-switch"
        role="group"
        aria-label="Explore creation types"
        data-uiverse="andrew-demchenk0/hot-bird-10"
      >
        {LAYERS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>
      {!compact && (
        <div className="assembly-description" aria-live="polite">
          <h3>{layer.title}</h3>
          <p>{layer.detail}</p>
          {onPick && (
            <button
              type="button"
              className="assembly-use"
              onClick={() => onPick(layer.prompt)}
            >
              Use this idea <ArrowUpRightIcon size={15} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
