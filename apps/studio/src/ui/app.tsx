// The Studio chat workspace: agents-starter's layout and Kumo components, driven by @flue/react.
import { Badge, Button, Empty, InputArea, Surface, Text } from '@cloudflare/kumo';
import { useFlueAgent } from '@flue/react';
import { createFlueClient, type FlueConversationMessage, type FlueConversationPart } from '@flue/sdk';
import {
  BrainIcon,
  CaretDownIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  CircleIcon,
  MoonIcon,
  PaperPlaneRightIcon,
  PlugsConnectedIcon,
  PlusIcon,
  SunIcon,
  WrenchIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { getProject } from './api.ts';
import { Projects } from './projects.tsx';
import { authHeaders, useSession } from './session.ts';
import { StudioStatus, useStudioLink } from './studio-status.tsx';
import { UndoChanges } from './undo.tsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /studio/projects/<id> -> the project id, or null. */
function projectIdFromPath(): string | null {
  const m = /\/studio\/projects\/([^/]+)/.exec(location.pathname);
  return m && UUID.test(m[1]) ? m[1] : null;
}

/** ?chat=<name> opens another conversation in the same project (the route accepts `<project>~<chat>`). */
function chatFromQuery(): string | null {
  const c = new URLSearchParams(location.search).get('chat');
  return c && /^[a-z0-9][a-z0-9-]{0,47}$/.test(c) ? c : null;
}

function newChat(projectId: string) {
  location.href = `/studio/projects/${projectId}?chat=c${Date.now().toString(36)}`;
}

function useTheme() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);
  return [dark, setDark] as const;
}

export function App() {
  const session = useSession();
  const projectId = projectIdFromPath();
  if (session === undefined) return null;
  if (!session) {
    return (
      <Centered title="Sign in to use StudPilot Studio">
        <Button variant="primary" onClick={() => (location.href = `/app/sign-in?next=${encodeURIComponent(location.pathname)}`)}>
          Sign in
        </Button>
      </Centered>
    );
  }
  if (!projectId) return <Projects />;
  return <Chat projectId={projectId} />;
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-kumo-elevated">
      <Empty icon={<ChatCircleDotsIcon size={32} />} title={title} contents={children} />
    </div>
  );
}

const STARTERS = ['What is in my place?', 'List my scripts', 'Are there errors in the output?'];

function Chat({ projectId }: { projectId: string }) {
  const [dark, setDark] = useTheme();
  const client = useMemo(
    () => {
      const chat = chatFromQuery();
      const conversation = chat ? `${projectId}~${chat}` : projectId;
      return createFlueClient({ url: `/studio/api/agents/studpilot/${conversation}`, headers: authHeaders });
    },
    [projectId],
  );
  const agent = useFlueAgent({ client });
  const [input, setInput] = useState('');
  const studio = useStudioLink(projectId);
  const notConnected = studio.link !== null && !studio.link.connected;
  const [projectName, setProjectName] = useState('');
  useEffect(() => {
    void getProject(projectId).then((p) => setProjectName(p?.name ?? ''));
  }, [projectId]);
  const end = useRef<HTMLDivElement>(null);
  const busy = agent.status === 'submitted' || agent.status === 'streaming';
  const visible = agent.messages.filter((m) => m.display === 'visible');

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [agent.messages]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    void agent.sendMessage(t);
  };

  return (
    <div className="flex h-full flex-col bg-kumo-elevated">
      <header className="border-b border-kumo-line bg-kumo-base px-5 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/studio/" className="text-kumo-default no-underline">
              <Text variant="heading3" as="span">StudPilot</Text>
            </a>
            <span className="truncate text-sm text-kumo-subtle">{projectName}</span>
            <Badge variant="secondary">Beta</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" icon={<PlusIcon size={14} />} disabled={busy} onClick={() => newChat(projectId)}>
              New chat
            </Button>
            <UndoChanges projectId={projectId} busy={busy} />
            <StudioStatus projectId={projectId} link={studio.link} refresh={studio.refresh} />
            <Status status={agent.status} />
            <Button
              variant="ghost"
              shape="square"
              aria-label={dark ? 'Use light mode' : 'Use dark mode'}
              icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
              onClick={() => setDark(!dark)}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-5 py-6">
          {agent.historyReady && visible.length === 0 && notConnected && (
            <Empty
              icon={<PlugsConnectedIcon size={32} />}
              title="Connect Studio to start"
              contents={
                <p className="max-w-sm text-center text-sm text-kumo-subtle">
                  Open your place in Roblox Studio, then press Connect Studio above and type the code into the StudPilot
                  plugin. StudPilot reads and changes the place through it.
                </p>
              }
            />
          )}
          {agent.historyReady && visible.length === 0 && !notConnected && (
            <Empty
              icon={<ChatCircleDotsIcon size={32} />}
              title="Ask about your place"
              contents={
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <Button key={s} variant="outline" size="sm" disabled={busy} onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              }
            />
          )}
          {visible.map((m, i) => (
            <Message key={m.id} message={m} live={busy && i === visible.length - 1} />
          ))}
          {agent.error && (
            <Surface className="rounded-xl p-3 text-sm text-kumo-danger">{agent.error.message}</Surface>
          )}
          <div ref={end} />
        </div>
      </main>

      <footer className="border-t border-kumo-line bg-kumo-base">
        <form
          className="mx-auto max-w-3xl px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:border-transparent focus-within:ring-2 focus-within:ring-kumo-ring">
            <InputArea
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask StudPilot about your place…"
              aria-label="Message"
              rows={2}
              className="flex-1 !border-none !bg-transparent !shadow-none !ring-0"
            />
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send"
              disabled={!input.trim() || busy}
              icon={<PaperPlaneRightIcon size={18} />}
            />
          </div>
        </form>
      </footer>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const label = status === 'error' ? 'Error' : status === 'connecting' ? 'Connecting' : status === 'idle' ? 'Ready' : 'Working';
  const tone = status === 'error' ? 'text-kumo-danger' : status === 'idle' ? 'text-kumo-success' : 'text-kumo-brand';
  return (
    <span className="flex items-center gap-1.5 text-xs text-kumo-subtle">
      <CircleIcon size={8} weight="fill" className={tone} />
      {label}
    </span>
  );
}

function Message({ message, live }: { message: FlueConversationMessage; live: boolean }) {
  const user = message.role === 'user';
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => (
        <Part key={`${message.id}-${i}`} part={part} user={user} live={live} />
      ))}
    </div>
  );
}

/** A delegation reads as the teammate it went to ("builder"), anything else by its tool name. */
function toolLabel(part: { toolName: string; input?: unknown }): string {
  const agent = (part.input as { agent?: unknown } | undefined)?.agent;
  return part.toolName === 'task' && typeof agent === 'string' ? agent : part.toolName;
}

function Part({ part, user, live }: { part: FlueConversationPart; user: boolean; live: boolean }) {
  if (part.type === 'text') {
    if (!part.text) return null;
    if (user) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-kumo-contrast px-4 py-2.5 leading-relaxed text-kumo-inverse">
            {part.text}
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base leading-relaxed text-kumo-default">
          <Streamdown className="p-3" controls={false} isAnimating={live && part.state === 'streaming'}>
            {part.text}
          </Streamdown>
        </div>
      </div>
    );
  }
  if (part.type === 'reasoning') {
    if (!part.text.trim()) return null;
    const done = part.state === 'done';
    return (
      <details className="max-w-[85%]" open={!done}>
        <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-kumo-line bg-kumo-control px-3 py-2 text-sm">
          <BrainIcon size={14} className="text-kumo-brand" />
          <span className="font-medium text-kumo-default">Reasoning</span>
          <span className={`text-xs ${done ? 'text-kumo-success' : 'text-kumo-brand'}`}>{done ? 'Complete' : 'Thinking…'}</span>
          <CaretDownIcon size={14} className="ml-auto text-kumo-inactive" />
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-kumo-control px-3 py-2 text-xs text-kumo-default">
          {part.text}
        </pre>
      </details>
    );
  }
  if (part.type === 'dynamic-tool') {
    const failed = 'errorText' in part && typeof part.errorText === 'string';
    const done = part.state === 'output-available';
    return (
      <div className="flex max-w-[85%] items-center gap-2 rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm">
        <WrenchIcon size={14} className="text-kumo-subtle" />
        <span className="font-mono text-kumo-default">{toolLabel(part)}</span>
        {failed ? (
          <XCircleIcon size={14} className="ml-auto text-kumo-danger" />
        ) : done ? (
          <CheckCircleIcon size={14} className="ml-auto text-kumo-success" />
        ) : (
          <span className="ml-auto text-xs text-kumo-brand">Running…</span>
        )}
      </div>
    );
  }
  return null;
}
