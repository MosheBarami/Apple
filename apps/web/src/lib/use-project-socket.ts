// useProjectSocket — the live wire between the workspace and the project's
// SessionDO: WebSocket with subprotocol auth, exponential-backoff reconnect,
// message history hydration, and typed ServerMsg fan-out into React state.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentPhase,
  ChatAttachment,
  CheckpointMeta,
  ClientMsg,
  StudioFrame,
  PlaytestRun,
  ProductMode,
  ProductModel,
  QuotaState,
  RunIntent,
  ServerMsg,
  StudioEventLog,
  StudioEventSelection,
  StudioEventState,
} from '@golem/shared';
// The rule for what counts as a new version of a message, shared with the DO so the count this
// client shows before the round trip and the rows the server writes cannot disagree.
import { recordsRevision } from '@golem/shared';
import type { PhaseMark } from '../components/ws/activity-model';
import type { RestoreStatus } from './restore-status';
import { fetchCheckpoints, fetchMessages } from './api';
// One definition of what a client-minted id looks like, and one place that reconciles it with the
// server's. Two would drift, and the drift is invisible until an Edit truncates from nowhere.
import { adoptUserMessageId, localId } from './message-identity';
import {
  MOCK_MODE,
  mockCheckpoints,
  mockFrames,
  mockIntent,
  mockLiveTools,
  mockLogs,
  mockMessages,
  mockPlaytest,
  mockQuota,
  mockSelection,
  mockStudioState,
} from './mock';
import { getAccessToken, supabase } from './supabase';
import { NO_LINK_FACTS, linkFactsFrom, type StudioLinkFacts } from './studio-connection';
import { chatItemFromMessageDto, createProjectRequestFence, mergeHistoryWithLive } from './project-socket-state';

export interface ToolEvent {
  toolId: string;
  tool: string;
  summary: string;
  /** Which resource this step is about — see `ToolStartEvent.target` in ws/activity-model.ts. */
  target?: string;
  ok?: boolean;
  startedAt: number;
  durationMs?: number;
  done: boolean;
  /**
   * Whether `startedAt` is a clock THIS client observed at `tool_start`.
   *
   * False for message history (which carries no start time) and for a
   * `run_state` replay (which stamps every tool with the RUN's start, not its
   * own). The activity timeline keys its elapsed figures off this: with an
   * unobserved start it reports measured tool time instead of wall time, rather
   * than presenting arithmetic as a measurement.
   */
  startObserved?: boolean;
  /**
   * Structured result payload from `tool_end`. Untrusted: it is only ever fed to
   * the generative-UI validator, never rendered directly.
   */
  detail?: unknown;
}

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  mode: ProductMode | null;
  /** Whether this Agent run was granted the Autonomous tool policy. */
  autonomous?: boolean;
  productModel?: ProductModel;
  content: string;
  tools: ToolEvent[];
  streaming: boolean;
  stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
  error?: string;
  createdAt: number;
  /**
   * When this client watched the run finish — set from `msg_end`, which is the only moment it
   * can be observed here.
   *
   * It exists because the terminal row needs a clock and the tools can no longer supply one for
   * an interrupted run: a step that never reported now carries no end time at all (see `msg_end`
   * below), so `eventsFromTurn`'s fallback — the last observed tool end — can be undefined, and
   * without a clock it emits no `run_end` and the card loses the row that says the run is over.
   * UNDEFINED FOR A RELOADED TURN, which did not watch anything; those carry real tool ends and
   * the fallback covers them.
   */
  endedAt?: number;
  /**
   * How many earlier versions of this message the user wrote before editing it.
   *
   * Comes with the transcript so the "edited" mark can be drawn without one request per turn, and
   * is incremented optimistically when an edit is sent — the server applies the same rule (see
   * `recordsRevision` in @golem/shared), so the two agree, and a reload corrects them if they ever
   * do not. Undefined means "nothing known", never "none": a worker that predates the feature
   * sends no field, and drawing "no earlier versions" from that would be an answer nobody checked.
   */
  revisions?: number;
  /**
   * What the worker announced it understood the request to be, from the
   * `run_intent` message (and replayed on `run_state`). UNDEFINED UNTIL THE
   * WORKER SENDS ONE — the Thinking card's Intent and Plan rows key off exactly
   * this, so an older run, or a deployment that does not emit it, shows no such
   * rows rather than invented ones. Message history carries no intent, so a
   * reloaded conversation is correctly silent about it.
   */
  intent?: RunIntent;
  /**
   * Tools this run was NOT given, because a tool permission removed them — from `tools_denied`.
   *
   * Absent until the worker sends/persists one. New terminal transcript rows carry the bounded list
   * through reload; legacy rows still omit it, which remains "unknown" rather than an invented
   * empty check.
   */
  deniedTools?: string[];
  /**
   * What this run cost, settled, from `msg_end`.
   *
   * It lives on the MESSAGE rather than on `AgentStatus` because `msg_end` clears the status in
   * the same breath — a cost kept there would be correct for one frame and then gone. New terminal
   * rows persist it for reload; a legacy row that never recorded it stays undefined rather than
   * being rendered as zero.
   */
  creditsSpent?: number;
  /**
   * What this run's prompt cost against its ceiling, and what the trim dropped — from the
   * `context_budget` message.
   *
   * UNDEFINED UNTIL THE WORKER SENDS ONE. New terminal rows persist this bounded measurement for
   * reload; a worker/row too old to have recorded it shows no budget rather than a confident zero.
   * `dropped` being absent means nothing was dropped rather than "we did not look".
   */
  context?: {
    usedChars: number;
    maxChars: number;
    dropped?: { groups: number; chars: number };
  };
}

export interface AgentStatus {
  /** A real stage the worker has entered. Never predicted or interpolated. */
  phase: AgentPhase;
  step?: number;
  totalSteps?: number;
  /**
   * What THIS run has cost so far, in Credits. Reported by the worker; never estimated here.
   *
   * Distinct from the account-wide `quota` message. A user watching a build wants to know what
   * the build is costing, and that was the one figure the server tracked and never sent.
   */
  creditsSpent?: number;
  /** The tool running right now, when the phase came from one. */
  tool?: string;
  /**
   * The reasoning POLICY's chosen tier and its own one-line justification
   * (e.g. "stone baseline; visual design task"). This is a classification of
   * the request, not the model's hidden reasoning — it never carries prompt or
   * transcript content.
   */
  effort?: 'low' | 'medium' | 'high';
  effortReason?: string;
}

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'offline';

/** One person on the project, exactly as ServerMsg.presence carries them. */
export type PresenceState = Extract<ServerMsg, { type: 'presence' }>['present'][number];

export interface ProjectSocket {
  conn: ConnState;
  /** A prompt the socket closed on before the server acknowledged it; hand it back to the person. */
  lostChat: { text: string; at: number } | null;
  clearLostChat: () => void;
  messages: ChatItem[];
  historyState: 'loading' | 'ready' | 'error';
  /**
   * `connected` is the worker's latest word. `everConnected` records whether it
   * has ever been true on this socket's lifetime — that is what separates
   * "Studio dropped" from "Studio was never here", and the two deserve
   * different copy. Neither says anything about the plugin being installed;
   * there is no signal for that. See lib/studio-connection.ts.
   */
  studio: {
    connected: boolean;
    state: StudioEventState | null;
    everConnected: boolean;
    /**
     * What is selected in Studio right now, from the `studio_selection` broadcast.
     *
     * THE MESSAGE WAS ARRIVING AND BEING DROPPED. The plugin captured the selection, the worker
     * re-derived every field of it and broadcast it on connect and on every real change — and
     * `handleServerMsg` had no case for it, so it fell through the switch and the browser knew
     * nothing about what the user was looking at. Null until the worker sends one, which is a
     * different fact from "nothing is selected" and is why the composer's chip is absent rather
     * than empty until then.
     */
    selection: StudioEventSelection | null;
    /**
     * WHEN it last polled, HOW MUCH is waiting, WHICH place it has open, and HOW SLOW the round
     * trip is — the four questions a user actually has once `connected` is false, every one of
     * which the worker already measured and put on the wire, and every one of which this hook used
     * to drop on the floor. See lib/studio-connection.ts for the rules, and for why an unmeasured
     * round trip is null here rather than 0.
     */
    link: StudioLinkFacts;
  };
  quota: QuotaState | null;
  /**
   * Everyone the worker can currently see on this project, from the `presence` message.
   *
   * Empty until the first one arrives, which is a different fact from "you are alone" — the
   * component that renders it says nothing at all rather than announcing an emptiness it has not
   * been told about yet.
   */
  presence: PresenceState[];
  agentStatus: AgentStatus | null;
  /**
   * Every distinct `agent_status.phase` this client has seen on the CURRENT
   * run, in arrival order, with the time it arrived.
   *
   * `agentStatus` alone is only the latest phase, so phase durations were
   * previously unrecoverable — the transition that ended a phase was overwritten
   * by the one that began the next. Two honesty caveats travel with this list
   * and are spelled out in `docs/THINKING-UX.md`: the timestamps are client
   * receipt times, not the worker's clock, and `agent_status` carries no
   * `msgId`, so marks can only ever be attributed to the run in flight.
   */
  phaseMarks: PhaseMark[];
  running: boolean;
  logs: StudioEventLog[];
  /** Recent frames rasterised inside Studio. Capped — these are large. */
  frames: StudioFrame[];
  /**
   * The playtest the worker says is happening, or null. NEVER synthesised here:
   * if the worker has not sent a `playtest_state`, there is no playtest as far
   * as this app is concerned, and the card does not appear.
   */
  playtest: PlaytestRun | null;
  checkpoints: CheckpointMeta[];
  checkpointsState: 'loading' | 'ready' | 'error';
  /**
   * The restore this project is doing, or the last one it did, or null.
   *
   * NEVER synthesised here, for the same reason as `playtest` above: if the worker has not sent a
   * `restore_status`, this app knows nothing about any restore and the drawer says nothing. A
   * spinner started by the click rather than by the server would keep spinning through a worker
   * that never received the frame.
   */
  restoreStatus: RestoreStatus | null;
  sendChat: (text: string, mode: ProductMode, attachments?: ChatAttachment[], productModel?: ProductModel, autonomous?: boolean) => boolean;
  /**
   * "I am still here, and this is what I am doing."
   *
   * The frame has been in the protocol and handled by the session DO since presence was written,
   * and nothing in this app ever sent one — so `typing` could not occur and a third of the
   * vocabulary the other people's faces are rendered from was unreachable. Returns whether it
   * went, like every other send here: a closed socket is not a presence update.
   */
  signalPresence: (activity: 'viewing' | 'typing' | 'building') => boolean;
  /** Replace an earlier prompt and re-run from it. Everything after it is discarded. */
  editAndResend: (messageId: string, text: string, mode: ProductMode, productModel?: ProductModel, autonomous?: boolean) => boolean;
  stop: () => void;
  /** @param description what the snapshot contains or why it was taken. Optional — see ClientMsg. */
  createCheckpoint: (label: string, description?: string) => void;
  restoreCheckpoint: (checkpointId: string) => void;
  reloadHistory: () => void;
  reloadCheckpoints: () => void;
  reconnectNow: () => void;
}

const MAX_LOGS = 300;
/** A long run announces a lot of phases; the card only needs the recent shape. */
const MAX_PHASE_MARKS = 120;
/** Each frame is ~207KB of base64 at the default 288x180. Keep very few. */
const MAX_FRAMES = 8;

/** Fixture conversation for mock mode — never reachable in a production build. */
function mockHistory(): ChatItem[] {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('empty') === '1') return [];
  const base: ChatItem[] = mockMessages.map((m) => ({
    id: m.id,
    role: m.role,
    mode: m.mode,
    content: m.content,
    tools: (m.toolTrace ?? []).map((t, i) => ({
      toolId: `${m.id}-t${i}`,
      tool: t.tool,
      summary: t.summary,
      ok: t.ok,
      // History carries no start time at all, so 0 is a placeholder, not a clock.
      startedAt: 0,
      startObserved: false,
      durationMs: t.durationMs,
      done: true,
      detail: t.detail,
    })),
    streaming: false,
    createdAt: new Date(m.createdAt).getTime(),
  }));
  // The fixture run's clock. `mockLiveTools` simulates a run this client
  // watched, so its tools carry observed starts laid end to end — that is what
  // exercises the activity timeline's wall-time path. Everything above it is
  // reloaded history and correctly has no clock at all.
  const runStart = Date.now() - 60_000;
  let cursor = runStart;
  base.push({
    id: 'm4',
    role: 'assistant',
    mode: 'agent',
    stopReason: 'done',
    content:
      "I rendered all five angles and ran the visual gate. It scored **6.5/10** — the portal and lighting read well, but the floor is one flat plate and the top-down view shows a lot of empty ground.\n\nI've already retextured the floor into alternating Concrete tiles. The composition fix (seating and planters) is bigger — say the word and I'll lay it out.",
    tools: mockLiveTools().map((t, i) => {
      // A 900ms gap between tools stands in for the model's own time, so the
      // fixture shows wall time exceeding the sum of tool durations — the
      // distinction the timeline's two elapsed bases exist to keep.
      const startedAt = cursor;
      cursor += t.durationMs + 900;
      return {
        toolId: `m4-t${i}`,
        tool: t.tool,
        summary: t.summary,
        ok: t.ok,
        startedAt,
        startObserved: true,
        durationMs: t.durationMs,
        done: true,
        detail: t.detail,
      };
    }),
    streaming: false,
    createdAt: runStart,
    // Only this fixture carries an intent, exactly as only a run that actually
    // emitted `run_intent` would. The earlier turns above deliberately have
    // none, so mock mode shows both shapes of the Thinking card side by side.
    intent: mockIntent,
  });
  return base;
}

export function useProjectSocket(
  projectId: string,
  onServerError: (code: string, message: string) => void,
  /**
   * Something worth knowing that did not stop anything — today, a credential spotted in the user's
   * own prompt. Optional so the hook keeps working for a caller that has nowhere to put it; the
   * workspace does, and a notice with no renderer would be the detection thrown away a second time.
   */
  onNotice?: (code: string, message: string) => void,
): ProjectSocket {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [studio, setStudio] = useState<{
    connected: boolean;
    state: StudioEventState | null;
    everConnected: boolean;
    selection: StudioEventSelection | null;
    link: StudioLinkFacts;
  }>({
    connected: false,
    state: null,
    everConnected: false,
    selection: null,
    link: NO_LINK_FACTS,
  });
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [presence, setPresence] = useState<PresenceState[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [phaseMarks, setPhaseMarks] = useState<PhaseMark[]>([]);
  const [running, setRunning] = useState(false);
  // A PROMPT SENT INTO A SOCKET THAT WAS ALREADY GONE. A deploy evicts the session and the browser
  // learns of the close a moment later; a frame written in between is accepted by ws.send and never
  // arrives. Measured 2026-09-23 twice in production: the prompt vanished from the box, nothing ran,
  // and nothing said so. Any frame from the server after the send proves it arrived, because a dead
  // socket delivers nothing; if the socket closes first, the prompt is handed back.
  const unackedChat = useRef<{ text: string; localId: string } | null>(null);
  const [lostChat, setLostChat] = useState<{ text: string; at: number } | null>(null);
  const clearLostChat = useCallback(() => setLostChat(null), []);
  const [logs, setLogs] = useState<StudioEventLog[]>([]);
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [playtest, setPlaytest] = useState<PlaytestRun | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus | null>(null);
  const [checkpointsState, setCheckpointsState] = useState<'loading' | 'ready' | 'error'>('loading');

  const wsRef = useRef<WebSocket | null>(null);
  const wsProjectRef = useRef<string | null>(null);
  const attemptsRef = useRef(0);
  const closedRef = useRef(false);
  const reconnectTimer = useRef<number | null>(null);
  const pingTimer = useRef<number | null>(null);
  const errorCbRef = useRef(onServerError);
  errorCbRef.current = onServerError;
  const noticeCbRef = useRef(onNotice);
  noticeCbRef.current = onNotice;
  // Selected during render, not in an effect. If a caller changes projectId without remounting the
  // hook, every outstanding A ticket becomes stale before B can paint or start another request.
  const requestFenceRef = useRef(createProjectRequestFence(projectId));
  requestFenceRef.current.select(projectId);
  const historyAbortRef = useRef<AbortController | null>(null);
  const checkpointsAbortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------- history
  const loadHistory = useCallback(() => {
    if (MOCK_MODE) {
      setMessages(mockHistory());
      setHistoryState('ready');
      setConn('open');
      setStudio({ connected: true, state: mockStudioState, everConnected: true, selection: mockSelection, link: NO_LINK_FACTS });
      setQuota(mockQuota);
      setLogs(mockLogs);
      return;
    }
    const ticket = requestFenceRef.current.begin('history');
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryState('loading');
    fetchMessages(projectId, 100, controller.signal)
      .then((res) => {
        if (!requestFenceRef.current.accepts(ticket)) return;
        const items: ChatItem[] = res.messages.map(chatItemFromMessageDto);
        // Merge duplicate ids rather than blindly replacing them: prompt-derived intent is live-only,
        // and a read that began mid-stream can still arrive with content older than the visible wire.
        setMessages((live) => mergeHistoryWithLive(items, live));
        setHistoryState('ready');
      })
      .catch((error: unknown) => {
        if (!requestFenceRef.current.accepts(ticket)) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setHistoryState('error');
      })
      .finally(() => {
        if (historyAbortRef.current === controller) historyAbortRef.current = null;
      });
  }, [projectId]);

  const loadCheckpoints = useCallback(() => {
    if (MOCK_MODE) {
      setCheckpoints(mockCheckpoints);
      setCheckpointsState('ready');
      // The build renders, plus a playtest in progress. The playtest frames are
      // stamped relative to now, so mock mode shows the card's real
      // fresh -> stale -> dead progression as it sits there rather than a
      // permanently "live" badge.
      const pt = mockPlaytest();
      setFrames([...mockFrames(), ...pt.frames]);
      setPlaytest(pt.run);
      return;
    }
    const ticket = requestFenceRef.current.begin('checkpoints');
    checkpointsAbortRef.current?.abort();
    const controller = new AbortController();
    checkpointsAbortRef.current = controller;
    setCheckpointsState('loading');
    fetchCheckpoints(projectId, controller.signal)
      .then((res) => {
        if (!requestFenceRef.current.accepts(ticket)) return;
        setCheckpoints(res.checkpoints);
        setCheckpointsState('ready');
      })
      .catch((error: unknown) => {
        if (!requestFenceRef.current.accepts(ticket)) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setCheckpointsState('error');
      })
      .finally(() => {
        if (checkpointsAbortRef.current === controller) checkpointsAbortRef.current = null;
      });
  }, [projectId]);

  useEffect(() => {
    loadHistory();
    loadCheckpoints();
  }, [loadHistory, loadCheckpoints]);

  useEffect(
    () => () => {
      historyAbortRef.current?.abort();
      checkpointsAbortRef.current?.abort();
    },
    [],
  );

  // ---------------------------------------------------------------- ws plumbing
  const sendRaw = useCallback((msg: ClientMsg): boolean => {
    const ws = wsRef.current;
    if (!ws || wsProjectRef.current !== projectId || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }, [projectId]);

  const handleServerMsg = useCallback((msg: ServerMsg) => {
    switch (msg.type) {
      case 'hello':
        setQuota(msg.quota);
        setStudio((s) => ({
          ...s,
          connected: msg.studioConnected,
          everConnected: s.everConnected || msg.studioConnected,
          link: linkFactsFrom(s.link, msg),
        }));
        break;
      case 'studio_status':
        setStudio((s) => ({
          ...s,
          connected: msg.connected,
          state: msg.state ?? null,
          everConnected: s.everConnected || msg.connected,
          link: linkFactsFrom(s.link, msg),
          // A selection belongs to an attached Studio. Keeping the last one after the plugin
          // dropped would offer the user a reference to objects nothing can act on any more.
          selection: msg.connected ? s.selection : null,
        }));
        break;
      case 'studio_selection':
        // Replaced wholesale, never merged: the worker sends the WHOLE selection each time and
        // only when it genuinely changed (see sameSelection in companion.ts), so this message is
        // the complete truth about what is selected. Merging would leave a deselected part on
        // screen as something the user could still point at.
        setStudio((s) => ({ ...s, selection: msg.selection }));
        break;
      case 'msg_start':
        setRunning(true);
        // A new run's phases are its own. Carrying the previous run's marks over
        // would attribute its timings to this one, and `agent_status` has no
        // msgId with which to catch the mistake later.
        setPhaseMarks([]);
        setMessages((raw) => {
          // THE USER'S OWN MESSAGE GETS ITS REAL NAME HERE.
          //
          // It was appended optimistically under an id this client minted, which no server had
          // ever heard of — so Edit, Try again and Regenerate, all of which resolve that id
          // against the messages table, failed on anything sent in this session and worked after a
          // reload. `adoptUserMessageId` returns the same array when there is nothing to adopt.
          const list = adoptUserMessageId(raw, msg.userMsgId);
          const existing = list.findIndex((m) => m.id === msg.msgId);
          if (existing !== -1) {
            // `run_intent` may have created the shell first; fill in the mode
            // it did not know, and keep the intent it did.
            const next = [...list];
            next[existing] = { ...list[existing]!, mode: msg.mode, autonomous: msg.autonomous, productModel: msg.productModel, streaming: true };
            return next;
          }
          return [
            ...list,
            {
              id: msg.msgId,
              role: 'assistant',
              mode: msg.mode,
              autonomous: msg.autonomous,
              productModel: msg.productModel,
              content: '',
              tools: [],
              streaming: true,
              createdAt: Date.now(),
            },
          ];
        });
        break;
      case 'delta':
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) {
            return [
              ...list,
              {
                id: msg.msgId,
                role: 'assistant',
                mode: null,
                content: msg.text,
                tools: [],
                streaming: true,
                createdAt: Date.now(),
              },
            ];
          }
          const item = list[idx]!;
          const next = [...list];
          next[idx] = { ...item, content: item.content + msg.text };
          return next;
        });
        break;
      case 'tool_start':
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) return list;
          const item = list[idx]!;
          const next = [...list];
          next[idx] = {
            ...item,
            tools: [
              ...item.tools,
              {
                toolId: msg.toolId,
                tool: msg.tool,
                summary: msg.summary,
                // Which thing this step is about. `summary` here is only the tool's name; the
                // sentence naming the resource arrives with tool_end, after the work is done.
                target: msg.target,
                startedAt: Date.now(),
                // The one path where the start really is our own clock.
                startObserved: true,
                done: false,
              },
            ],
          };
          return next;
        });
        break;
      case 'tool_end':
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) return list;
          const item = list[idx]!;
          const next = [...list];
          next[idx] = {
            ...item,
            tools: item.tools.map((t) =>
              t.toolId === msg.toolId
                ? {
                    ...t,
                    ok: msg.ok,
                    summary: msg.summary || t.summary,
                    durationMs: Date.now() - t.startedAt,
                    done: true,
                    detail: msg.detail,
                  }
                : t,
            ),
          };
          return next;
        });
        break;
      case 'history_truncated': {
        // The server has deleted these rows. Dropping them here is not cosmetic: a client that
        // keeps showing them is showing a conversation that no longer exists, and every later
        // index — the "last assistant" the phase marks attach to, most of all — is then wrong.
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.fromMessageId);
          return idx === -1 ? list : list.slice(0, idx);
        });
        break;
      }
      case 'msg_end':
        setRunning(false);
        setAgentStatus(null);
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) return list;
          const item = list[idx]!;
          const next = [...list];
          next[idx] = {
            ...item,
            streaming: false,
            stopReason: msg.stopReason,
            error: msg.error,
            // Only when the worker sent one: `?? item.creditsSpent` rather than `?? 0`, so an older
            // worker leaves the field absent instead of asserting that the run was free.
            creditsSpent: msg.creditsSpent ?? item.creditsSpent,
            // WHEN THE RUN ENDS THIS DOES NOT LEARN HOW EACH STEP ENDED.
            //
            // It used to write `ok: false` and a `durationMs` computed from this instant onto every
            // tool still open — two measurements, neither of them observed. `tool_end` is the only
            // message that carries an outcome, and for these it never arrived: the run stopped
            // first. So a step that was interrupted was reported as one that FAILED, with a
            // duration attached as though somebody had timed it.
            //
            // It also made the reducer's `unknown` state unreachable. activity-model.ts defines it
            // in as many words — "the step started, the run is over, and no result for it ever
            // arrived" — and wrote the copy, the dashed glyph and the sentence "The run ended
            // before this step reported a result." for it. Nothing could ever produce it, because
            // this line answered the question before the reducer could decline to.
            //
            // `done: true` is honest and is all that is known: the step is not running any more.
            // `ok` stays undefined and no duration is invented. `endedAt` below is the one clock
            // this client did watch — the arrival of msg_end — and it is what dates the terminal
            // row now that these tools no longer carry a synthetic end.
            endedAt: Date.now(),
            tools: item.tools.map((t) => (t.done ? t : { ...t, done: true })),
          };
          return next;
        });
        break;
      case 'run_intent':
        // Attach to the run's own message. `run_intent` is emitted at run start
        // and can land either side of `msg_start`, so create the shell if it is
        // not there yet — the same pattern `delta` uses. Nothing is synthesised:
        // the intent stored is exactly what the worker sent.
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) {
            return [
              ...list,
              {
                id: msg.msgId,
                role: 'assistant',
                mode: null,
                content: '',
                tools: [],
                streaming: true,
                createdAt: Date.now(),
                intent: msg.intent,
              },
            ];
          }
          const next = [...list];
          next[idx] = { ...list[idx]!, intent: msg.intent };
          return next;
        });
        break;
      case 'agent_status':
        // Record the transition, not just the latest value. Only a CHANGE of
        // phase is a mark: the worker re-announces the same phase within a step,
        // and treating a re-announcement as a new state would chop one phase
        // into several and restart its clock each time.
        setPhaseMarks((marks) => {
          const last = marks[marks.length - 1];
          if (last && last.phase === msg.phase) return marks;
          return [...marks, { phase: msg.phase, at: Date.now() }].slice(-MAX_PHASE_MARKS);
        });
        // Carry forward the last known effort: the policy announces it once per
        // step, but the phase changes several times within a step.
        setAgentStatus((prev) => ({
          phase: msg.phase,
          step: msg.step ?? prev?.step,
          totalSteps: msg.totalSteps ?? prev?.totalSteps,
          tool: msg.tool,
          effort: msg.effort ?? prev?.effort,
          effortReason: msg.effortReason ?? prev?.effortReason,
          // Carried forward like effort, and for the same reason: the cost is settled once per
          // step while the phase changes several times within one. Falling back to `prev` keeps
          // the figure from flickering back to nothing between settlements.
          creditsSpent: msg.creditsSpent ?? prev?.creditsSpent,
        }));
        break;
      case 'run_state': {
        // A build was already in flight when this socket opened — most often
        // because the user refreshed mid-run. The run never stopped; only our
        // view of it did. Rebuild that view from the worker's snapshot.
        if (!msg.run) {
          setRunning(false);
          setAgentStatus(null);
          setPhaseMarks([]);
          break;
        }
        const run = msg.run;
        setRunning(true);
        // The snapshot carries the CURRENT phase and no history of the earlier
        // ones — they ended before this socket existed. So the mark list starts
        // here, and the phases before the refresh are honestly gone rather than
        // reconstructed from the tool list.
        setPhaseMarks([{ phase: run.phase, at: Date.now() }]);
        setAgentStatus({
          phase: run.phase,
          step: run.step,
          totalSteps: run.totalSteps,
          effort: run.effort,
          effortReason: run.effortReason,
        });
        setMessages((list) => {
          const restored: ChatItem = {
            id: run.msgId,
            role: 'assistant',
            mode: run.mode,
            productModel: run.productModel,
            content: run.text,
            tools: run.tools.map((t) => ({
              toolId: t.toolId,
              tool: t.tool,
              summary: t.summary,
              ok: t.ok,
              // Every replayed tool gets the RUN's start, because that is all
              // the snapshot has. Flagged so the timeline reports measured tool
              // time for these rather than a wall clock it never watched.
              startedAt: run.startedAt,
              startObserved: false,
              durationMs: t.durationMs,
              done: true,
              detail: t.detail,
            })),
            streaming: true,
            createdAt: run.startedAt,
            // Replayed only when the snapshot genuinely carries one.
            intent: run.intent,
            // Same: `tools_denied` is broadcast once at the first step, so without this a refresh
            // at step nine leaves the run looking as though nothing had been withheld from it.
            deniedTools: run.deniedTools,
          };
          const idx = list.findIndex((m) => m.id === run.msgId);
          if (idx === -1) return [...list, restored];
          const next = [...list];
          next[idx] = restored;
          return next;
        });
        break;
      }
      case 'tools_denied':
        // Kept on the MESSAGE rather than on `agentStatus`, for the reason `creditsSpent` is:
        // `msg_end` clears the status, and this is a fact about the run that is most worth reading
        // AFTER it, by someone asking why the agent did not do the thing they expected.
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) return list;
          const next = [...list];
          next[idx] = { ...list[idx]!, deniedTools: msg.tools };
          return next;
        });
        break;
      case 'context_budget':
        // Kept on the MESSAGE, not on `agentStatus`, for the same reason `creditsSpent` is: the
        // status is cleared by `msg_end`, so a figure stored there would be correct for one frame
        // and then gone — and this one is most worth reading after the run, when the user is
        // trying to understand why a long conversation started behaving differently.
        //
        // The LAST report of a run wins: a sixteen-step build trims on several steps, and the size
        // of the prompt that was actually sent last is the one that describes where the run ended
        // up. `dropped` is carried forward from any earlier step that dropped turns, because a turn
        // dropped on step 4 is still gone at step 16 — clearing it would un-disclose a real loss.
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === msg.msgId);
          if (idx === -1) return list;
          const item = list[idx]!;
          const next = [...list];
          const prior = item.context?.dropped;
          const dropped = msg.dropped
            ? {
                groups: (prior?.groups ?? 0) + msg.dropped.groups,
                chars: (prior?.chars ?? 0) + msg.dropped.chars,
              }
            : prior;
          next[idx] = {
            ...item,
            context: {
              usedChars: msg.usedChars,
              maxChars: msg.maxChars,
              ...(dropped ? { dropped } : {}),
            },
          };
          return next;
        });
        break;
      case 'quota':
        setQuota(msg.quota);
        break;
      case 'checkpoint':
        setCheckpoints((list) => {
          const without = list.filter((c) => c.id !== msg.checkpoint.id);
          return [msg.checkpoint, ...without].sort((a, b) => b.createdAt - a.createdAt);
        });
        break;
      case 'restore_status':
        // Straight through, latest wins. The worker owns the whole record — which phase, the
        // plugin's counts, the caveat — precisely so the drawer cannot drift from what actually
        // happened to the place.
        setRestoreStatus(msg);
        break;
      case 'studio_frame':
        // Uncompressed RGB is heavy, so only the most recent handful are kept
        // in memory. They are never persisted.
        setFrames((list) => [...list, msg.frame].slice(-MAX_FRAMES));
        break;
      case 'playtest_state':
        // Straight through. The worker owns every field on this record —
        // elapsed time, console counts, frame tallies — precisely so the card
        // cannot drift from what actually happened during the run.
        setPlaytest(msg.run);
        break;
      case 'studio_log':
        setLogs((list) => [...list, ...msg.entries].slice(-MAX_LOGS));
        break;
      case 'error':
        //[[ A TERMINAL ERROR ENDS THIS REQUEST. AN INFORMATIONAL ERROR DOES NOT.
        //
        //   This called the toast and nothing else, so `running` stayed true and the workspace went
        //   on saying the agent was thinking — forever, with a red toast next to it. That is the
        //   owner's own report of the product: "the agent always in the thinking fails at
        //   something".
        //
        //   Reproduced end to end on 2026-09-20 by infra/e2e.mjs against the deployed product. A
        //   free account asking for Apple MAX gets `product_model_unavailable`, which session.ts
        //   sends through `refuseOne` — one message, then return. No msg_end, no run_state, no
        //   terminal event of any kind. The harness waited 150 seconds and gave up; a person waits
        //   as long as they are willing to.
        //
        //   The worker now marks request refusals terminal:true and role_changed terminal:false.
        //   Older workers omitted the field, so preserve the legacy fatal behaviour for undefined
        //   except for the one historical informational code whose semantics are already known.
        if (msg.terminal === true || (msg.terminal === undefined && msg.code !== 'role_changed')) {
          setRunning(false);
          setAgentStatus(null);
        }
        errorCbRef.current(msg.code, msg.message);
        break;
      case 'notice':
        // NOT routed to the error callback. The run is still going, and a failure-shaped warning
        // about a run that did not fail teaches people to distrust both.
        noticeCbRef.current?.(msg.code, msg.message);
        break;
      case 'presence':
        //[[ WHO ELSE IS IN THIS PROJECT.
        //
        //   Replaced wholesale rather than merged: the server derives this from the sockets that
        //   are actually attached, so the message IS the whole truth about the room. Merging would
        //   keep a person on screen after their last tab closed, and a presence indicator that
        //   outlives the connection fails in the one way nobody notices. ]]
        setPresence(msg.present);
        return;
      case 'pong':
        //[[ THE ONLY ROUND TRIP THIS APP CAN HONESTLY TIME, and it was being thrown away.
        //
        //   `t` is the browser's own clock at send, echoed back untouched by the worker — so the
        //   subtraction happens entirely in one clock domain, which is the only arrangement that
        //   means anything. Comparing a server timestamp with a local one would produce clock skew
        //   wearing the costume of latency.
        //
        //   NOTHING IS SET WHEN `t` IS ABSENT. A tab talking to a worker build that does not echo
        //   it has not measured the link, and `Date.now() - undefined` is NaN while
        //   `Date.now() - 0` is a plausible-looking 1.7 trillion. Staying null is the honest state,
        //   and `latencyLabel` renders null as nothing at all. ]]
        if (typeof msg.t === 'number') {
          const rtt = Date.now() - msg.t;
          setStudio((s) => ({ ...s, link: { ...s.link, rttMs: rtt >= 0 ? rtt : null } }));
        }
        break;
    }
  }, []);

  const connect = useCallback(async () => {
    if (MOCK_MODE || closedRef.current) return;
    const socketProjectId = projectId;
    if (!requestFenceRef.current.isSelected(socketProjectId)) return;
    // Refresh the Supabase session before (re)connecting; getSession auto-refreshes
    // an expired token, and an explicit refresh keeps long-lived tabs healthy.
    let token = await getAccessToken();
    if (!token) {
      const { data } = await supabase.auth.refreshSession();
      token = data.session?.access_token ?? null;
    }
    if (closedRef.current || !requestFenceRef.current.isSelected(socketProjectId)) return;
    if (!token) {
      setConn('offline');
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    //[[ THE SHARED SOCKET, FOR THE OWNER TOO.
    //
    //   `/api/projects/:id/ws` is owner-only and stays that way. This client asks for the shared
    //   one because the owner is simply the strongest member there: the worker resolves their role
    //   from the project row, not from anything on the wire, so an owner's socket is identical
    //   either way and costs the same one database round trip.
    //
    //   What changes is that a collaborator gets a socket at all — they can watch a build, see who
    //   else is here, and be refused by name when they try to start one. Pointing this at the
    //   owner-only route would have left every collaboration feature reachable by curl and by
    //   nothing a person can click. ]]
    const url = `${proto}://${location.host}/api/shared/${encodeURIComponent(projectId)}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['golem.v1', `golem.jwt.${token}`]);
    } catch {
      if (!requestFenceRef.current.isSelected(socketProjectId)) return;
      setConn('offline');
      return;
    }
    if (!requestFenceRef.current.isSelected(socketProjectId)) {
      try { ws.close(1000, 'project changed'); } catch { /* already closed */ }
      return;
    }
    wsRef.current = ws;
    wsProjectRef.current = socketProjectId;

    ws.onopen = () => {
      if (wsRef.current !== ws || !requestFenceRef.current.isSelected(socketProjectId)) return;
      attemptsRef.current = 0;
      setConn('open');
      if (pingTimer.current) window.clearInterval(pingTimer.current);
      pingTimer.current = window.setInterval(() => {
        // `t` is this browser's clock, echoed back untouched on the pong so the round trip is
        // measured in one clock domain. See the 'pong' case.
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', t: Date.now() } satisfies ClientMsg));
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      if (wsRef.current !== ws || !requestFenceRef.current.isSelected(socketProjectId)) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerMsg;
      } catch {
        return;
      }
      // Only a frame that ANSWERS a chat acknowledges it: the run starting, or a refusal. Presence and
      // status frames are broadcast to every socket all the time, so counting them would clear a
      // prompt that never arrived (caught by simulating the dropped frame in production).
      if (msg.type === 'msg_start' || msg.type === 'error' || msg.type === 'quota' || msg.type === 'notice') {
        unackedChat.current = null;
      }
      handleServerMsg(msg);
    };

    ws.onclose = () => {
      if (wsRef.current !== ws || !requestFenceRef.current.isSelected(socketProjectId)) return;
      const lost = unackedChat.current;
      unackedChat.current = null;
      if (lost) {
        setMessages((list) => list.filter((m) => m.id !== lost.localId));
        setRunning(false);
        setLostChat({ text: lost.text, at: Date.now() });
      }
      wsRef.current = null;
      wsProjectRef.current = null;
      if (pingTimer.current) {
        window.clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      if (closedRef.current) return;
      setConn('reconnecting');
      // The round trip belonged to the socket that just closed. Keeping the last number would
      // report a link that is measurably fast while nothing can reach it at all; the heartbeat and
      // the queue depth DO survive, because they are facts about Studio rather than about this
      // socket, and dating the disconnection is the whole point of keeping them.
      setStudio((s) => ({ ...s, connected: false, link: { ...s.link, rttMs: null } }));
      const attempt = attemptsRef.current++;
      const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      reconnectTimer.current = window.setTimeout(() => void connect(), delay);
    };

    ws.onerror = () => {
      // onclose follows; nothing to do here
    };
  }, [projectId, handleServerMsg]);

  const reconnectNow = useCallback(() => {
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    attemptsRef.current = 0;
    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    setConn('reconnecting');
    void connect();
  }, [connect]);

  useEffect(() => {
    if (MOCK_MODE) {
      setConn('open');
      return;
    }
    closedRef.current = false;
    attemptsRef.current = 0;
    setConn('connecting');
    void connect();
    const onOnline = () => reconnectNow();
    window.addEventListener('online', onOnline);
    return () => {
      closedRef.current = true;
      window.removeEventListener('online', onOnline);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (pingTimer.current) window.clearInterval(pingTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      wsProjectRef.current = null;
      try {
        ws?.close(1000, 'leaving workspace');
      } catch {
        /* already closed */
      }
    };
  }, [connect, reconnectNow]);

  // ---------------------------------------------------------------- actions
  /**
   * Replace an earlier prompt and run again from there.
   *
   * The optimistic update mirrors what the server does — drop everything from the edited message
   * on, then append the new one — because the alternative is a visible flash in which the old
   * messages are still there while the round trip completes, and the user cannot tell whether the
   * edit took.
   *
   * `history_truncated` arrives moments later and is idempotent against this: it slices from a
   * message id that has already gone, finds nothing, and changes nothing.
   */
  const editAndResend = useCallback(
    (messageId: string, text: string, mode: ProductMode, productModel?: ProductModel, autonomous = false): boolean => {
      const enabled = mode === 'agent' && autonomous;
      const ok = sendRaw({ type: 'edit_resend', messageId, text, mode, ...(enabled ? { autonomous: true } : {}), ...(productModel ? { productModel } : {}) });
      if (ok) {
        setRunning(true);
        setMessages((list) => {
          const idx = list.findIndex((m) => m.id === messageId);
          const kept = idx === -1 ? list : list.slice(0, idx);
          // The message that replaces an edited one is the SAME message, one version later, so its
          // history comes with it. `recordsRevision` is the server's own rule, imported rather than
          // restated: a retry resends the text unchanged on purpose, and counting that would tell
          // someone who regenerated four times that they had rewritten their prompt four times.
          const edited = idx === -1 ? undefined : list[idx];
          const carried = edited?.revisions;
          const revisions =
            edited && recordsRevision(edited.content, text) ? (carried ?? 0) + 1 : carried;
          return [
            ...kept,
            { id: localId(), role: 'user', mode, autonomous: enabled, productModel, content: text, tools: [], streaming: false, createdAt: Date.now(), revisions },
          ];
        });
      }
      return ok;
    },
    [sendRaw],
  );

  const sendChat = useCallback(
    (text: string, mode: ProductMode, attachments: ChatAttachment[] = [], productModel?: ProductModel, autonomous = false): boolean => {
      // The field has been on this frame since the protocol was written and nothing ever set it.
      // Omitted entirely when there are none, so a message with no files is byte-identical on the
      // wire to every message this product has ever sent.
      const enabled = mode === 'agent' && autonomous;
      const ok = sendRaw({ type: 'chat', text, mode, ...(enabled ? { autonomous: true } : {}), ...(productModel ? { productModel } : {}), ...(attachments.length ? { attachments } : {}) });
      if (ok) {
        setRunning(true);
        const id = localId();
        unackedChat.current = { text, localId: id };
        setMessages((list) => [
          ...list,
          {
            id,
            role: 'user',
            mode,
            autonomous: enabled,
            productModel,
            content: text,
            tools: [],
            streaming: false,
            createdAt: Date.now(),
          },
        ]);
      }
      return ok;
    },
    [sendRaw],
  );

  const signalPresence = useCallback(
    (activity: 'viewing' | 'typing' | 'building') => sendRaw({ type: 'presence', activity }),
    [sendRaw],
  );

  const stop = useCallback(() => {
    sendRaw({ type: 'stop' });
  }, [sendRaw]);

  const createCheckpoint = useCallback(
    (label: string, description?: string) => {
      // Omitted rather than sent empty: the worker turns blank into null, and a frame that always
      // carries the field would make "they wrote nothing" indistinguishable from an older client.
      sendRaw(description ? { type: 'checkpoint_create', label, description } : { type: 'checkpoint_create', label });
    },
    [sendRaw],
  );

  const restoreCheckpoint = useCallback(
    (checkpointId: string) => {
      sendRaw({ type: 'checkpoint_restore', checkpointId });
    },
    [sendRaw],
  );

  return {
    conn,
    lostChat,
    clearLostChat,
    messages,
    historyState,
    studio,
    quota,
    presence,
    agentStatus,
    phaseMarks,
    running,
    logs,
    frames,
    playtest,
    checkpoints,
    checkpointsState,
    restoreStatus,
    sendChat,
    signalPresence,
    editAndResend,
    stop,
    createCheckpoint,
    restoreCheckpoint,
    reloadHistory: loadHistory,
    reloadCheckpoints: loadCheckpoints,
    reconnectNow,
  };
}
