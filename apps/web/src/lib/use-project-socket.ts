// useProjectSocket — the live wire between the workspace and the project's
// SessionDO: WebSocket with subprotocol auth, exponential-backoff reconnect,
// message history hydration, and typed ServerMsg fan-out into React state.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentPhase,
  CheckpointMeta,
  ClientMsg,
  StudioFrame,
  GolemMode,
  QuotaState,
  ServerMsg,
  StudioEventLog,
  StudioEventState,
} from '@golem/shared';
import { fetchCheckpoints, fetchMessages } from './api';
import { MOCK_MODE, mockCheckpoints, mockFrames, mockLiveTools, mockLogs, mockMessages, mockQuota, mockStudioState } from './mock';
import { getAccessToken, supabase } from './supabase';

export interface ToolEvent {
  toolId: string;
  tool: string;
  summary: string;
  ok?: boolean;
  startedAt: number;
  durationMs?: number;
  done: boolean;
  /**
   * Structured result payload from `tool_end`. Untrusted: it is only ever fed to
   * the generative-UI validator, never rendered directly.
   */
  detail?: unknown;
}

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  mode: GolemMode | null;
  content: string;
  tools: ToolEvent[];
  streaming: boolean;
  stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
  error?: string;
  createdAt: number;
}

export interface AgentStatus {
  /** A real stage the worker has entered. Never predicted or interpolated. */
  phase: AgentPhase;
  step?: number;
  totalSteps?: number;
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

export interface ProjectSocket {
  conn: ConnState;
  messages: ChatItem[];
  historyState: 'loading' | 'ready' | 'error';
  studio: { connected: boolean; state: StudioEventState | null };
  quota: QuotaState | null;
  agentStatus: AgentStatus | null;
  running: boolean;
  logs: StudioEventLog[];
  /** Recent frames rasterised inside Studio. Capped — these are large. */
  frames: StudioFrame[];
  checkpoints: CheckpointMeta[];
  checkpointsState: 'loading' | 'ready' | 'error';
  sendChat: (text: string, mode: GolemMode) => boolean;
  stop: () => void;
  createCheckpoint: (label: string) => void;
  restoreCheckpoint: (checkpointId: string) => void;
  reloadHistory: () => void;
  reloadCheckpoints: () => void;
  reconnectNow: () => void;
}

const MAX_LOGS = 300;
/** Each frame is ~207KB of base64 at the default 288x180. Keep very few. */
const MAX_FRAMES = 8;
let localIdCounter = 0;
const localId = () => `local-${Date.now()}-${localIdCounter++}`;

/** Fixture conversation for mock mode — never reachable in a production build. */
function mockHistory(): ChatItem[] {
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
      startedAt: 0,
      durationMs: t.durationMs,
      done: true,
    })),
    streaming: false,
    createdAt: new Date(m.createdAt).getTime(),
  }));
  base.push({
    id: 'm4',
    role: 'assistant',
    mode: 'stone',
    content:
      "I rendered all five angles and ran the visual gate. It scored **6.5/10** — the portal and lighting read well, but the floor is one flat plate and the top-down view shows a lot of empty ground.\n\nI've already retextured the floor into alternating Concrete tiles. The composition fix (seating and planters) is bigger — say the word and I'll lay it out.",
    tools: mockLiveTools().map((t, i) => ({
      toolId: `m4-t${i}`,
      tool: t.tool,
      summary: t.summary,
      ok: t.ok,
      startedAt: 0,
      durationMs: t.durationMs,
      done: true,
      detail: t.detail,
    })),
    streaming: false,
    createdAt: Date.now() - 60_000,
  });
  return base;
}

export function useProjectSocket(projectId: string, onServerError: (code: string, message: string) => void): ProjectSocket {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [studio, setStudio] = useState<{ connected: boolean; state: StudioEventState | null }>({
    connected: false,
    state: null,
  });
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<StudioEventLog[]>([]);
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [checkpointsState, setCheckpointsState] = useState<'loading' | 'ready' | 'error'>('loading');

  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const closedRef = useRef(false);
  const reconnectTimer = useRef<number | null>(null);
  const pingTimer = useRef<number | null>(null);
  const errorCbRef = useRef(onServerError);
  errorCbRef.current = onServerError;

  // ---------------------------------------------------------------- history
  const loadHistory = useCallback(() => {
    if (MOCK_MODE) {
      setMessages(mockHistory());
      setHistoryState('ready');
      setConn('open');
      setStudio({ connected: true, state: mockStudioState });
      setQuota(mockQuota);
      setLogs(mockLogs);
      return;
    }
    setHistoryState('loading');
    fetchMessages(projectId)
      .then((res) => {
        const items: ChatItem[] = res.messages.map((m) => ({
          id: m.id,
          role: m.role,
          mode: m.mode,
          content: m.content,
          tools: (m.toolTrace ?? []).map((t, i) => ({
            toolId: `${m.id}-t${i}`,
            tool: t.tool,
            summary: t.summary,
            ok: t.ok,
            startedAt: 0,
            durationMs: t.durationMs,
            done: true,
          })),
          streaming: false,
          createdAt: new Date(m.createdAt).getTime(),
        }));
        setMessages((live) => {
          // keep any items that arrived over the socket while history loaded
          const known = new Set(items.map((i) => i.id));
          return [...items, ...live.filter((l) => !known.has(l.id))];
        });
        setHistoryState('ready');
      })
      .catch(() => setHistoryState('error'));
  }, [projectId]);

  const loadCheckpoints = useCallback(() => {
    if (MOCK_MODE) {
      setCheckpoints(mockCheckpoints);
      setCheckpointsState('ready');
      setFrames(mockFrames());
      return;
    }
    setCheckpointsState('loading');
    fetchCheckpoints(projectId)
      .then((res) => {
        setCheckpoints(res.checkpoints);
        setCheckpointsState('ready');
      })
      .catch(() => setCheckpointsState('error'));
  }, [projectId]);

  useEffect(() => {
    loadHistory();
    loadCheckpoints();
  }, [loadHistory, loadCheckpoints]);

  // ---------------------------------------------------------------- ws plumbing
  const sendRaw = useCallback((msg: ClientMsg): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleServerMsg = useCallback((msg: ServerMsg) => {
    switch (msg.type) {
      case 'hello':
        setQuota(msg.quota);
        setStudio((s) => ({ ...s, connected: msg.studioConnected }));
        break;
      case 'studio_status':
        setStudio({ connected: msg.connected, state: msg.state ?? null });
        break;
      case 'msg_start':
        setRunning(true);
        setMessages((list) => {
          if (list.some((m) => m.id === msg.msgId)) return list;
          return [
            ...list,
            {
              id: msg.msgId,
              role: 'assistant',
              mode: msg.mode,
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
              { toolId: msg.toolId, tool: msg.tool, summary: msg.summary, startedAt: Date.now(), done: false },
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
            tools: item.tools.map((t) => (t.done ? t : { ...t, done: true, ok: false, durationMs: Date.now() - t.startedAt })),
          };
          return next;
        });
        break;
      case 'agent_status':
        // Carry forward the last known effort: the policy announces it once per
        // step, but the phase changes several times within a step.
        setAgentStatus((prev) => ({
          phase: msg.phase,
          step: msg.step ?? prev?.step,
          totalSteps: msg.totalSteps ?? prev?.totalSteps,
          tool: msg.tool,
          effort: msg.effort ?? prev?.effort,
          effortReason: msg.effortReason ?? prev?.effortReason,
        }));
        break;
      case 'run_state': {
        // A build was already in flight when this socket opened — most often
        // because the user refreshed mid-run. The run never stopped; only our
        // view of it did. Rebuild that view from the worker's snapshot.
        if (!msg.run) {
          setRunning(false);
          setAgentStatus(null);
          break;
        }
        const run = msg.run;
        setRunning(true);
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
            content: run.text,
            tools: run.tools.map((t) => ({
              toolId: t.toolId,
              tool: t.tool,
              summary: t.summary,
              ok: t.ok,
              startedAt: run.startedAt,
              durationMs: t.durationMs,
              done: true,
              detail: t.detail,
            })),
            streaming: true,
            createdAt: run.startedAt,
          };
          const idx = list.findIndex((m) => m.id === run.msgId);
          if (idx === -1) return [...list, restored];
          const next = [...list];
          next[idx] = restored;
          return next;
        });
        break;
      }
      case 'quota':
        setQuota(msg.quota);
        break;
      case 'checkpoint':
        setCheckpoints((list) => {
          const without = list.filter((c) => c.id !== msg.checkpoint.id);
          return [msg.checkpoint, ...without].sort((a, b) => b.createdAt - a.createdAt);
        });
        break;
      case 'studio_frame':
        // Uncompressed RGB is heavy, so only the most recent handful are kept
        // in memory. They are never persisted.
        setFrames((list) => [...list, msg.frame].slice(-MAX_FRAMES));
        break;
      case 'studio_log':
        setLogs((list) => [...list, ...msg.entries].slice(-MAX_LOGS));
        break;
      case 'error':
        errorCbRef.current(msg.code, msg.message);
        break;
      case 'pong':
        break;
    }
  }, []);

  const connect = useCallback(async () => {
    if (MOCK_MODE || closedRef.current) return;
    // Refresh the Supabase session before (re)connecting; getSession auto-refreshes
    // an expired token, and an explicit refresh keeps long-lived tabs healthy.
    let token = await getAccessToken();
    if (!token) {
      const { data } = await supabase.auth.refreshSession();
      token = data.session?.access_token ?? null;
    }
    if (closedRef.current) return;
    if (!token) {
      setConn('offline');
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/projects/${encodeURIComponent(projectId)}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['golem.v1', `golem.jwt.${token}`]);
    } catch {
      setConn('offline');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      attemptsRef.current = 0;
      setConn('open');
      if (pingTimer.current) window.clearInterval(pingTimer.current);
      pingTimer.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' } satisfies ClientMsg));
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerMsg;
      } catch {
        return;
      }
      handleServerMsg(msg);
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (pingTimer.current) {
        window.clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      if (closedRef.current) return;
      setConn('reconnecting');
      setStudio((s) => ({ ...s, connected: false }));
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
      try {
        ws?.close(1000, 'leaving workspace');
      } catch {
        /* already closed */
      }
    };
  }, [connect, reconnectNow]);

  // ---------------------------------------------------------------- actions
  const sendChat = useCallback(
    (text: string, mode: GolemMode): boolean => {
      const ok = sendRaw({ type: 'chat', text, mode });
      if (ok) {
        setRunning(true);
        setMessages((list) => [
          ...list,
          {
            id: localId(),
            role: 'user',
            mode,
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

  const stop = useCallback(() => {
    sendRaw({ type: 'stop' });
  }, [sendRaw]);

  const createCheckpoint = useCallback(
    (label: string) => {
      sendRaw({ type: 'checkpoint_create', label });
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
    messages,
    historyState,
    studio,
    quota,
    agentStatus,
    running,
    logs,
    frames,
    checkpoints,
    checkpointsState,
    sendChat,
    stop,
    createCheckpoint,
    restoreCheckpoint,
    reloadHistory: loadHistory,
    reloadCheckpoints: loadCheckpoints,
    reconnectNow,
  };
}
