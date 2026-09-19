import { useEffect, useMemo, useState } from 'react';
import { Thinking } from '../components/ws/thinking';
import { ChatWelcome } from '../components/ws/chat-welcome';
import { ModelMark } from '../components/ws/model-mark';
import { reduceActivity, type ActivityEvent, type StopReason } from '../components/ws/activity-model';
import type { ToolEvent } from '../lib/use-project-socket';
import { useTheme, usePrefs } from '../lib/theme';

const SCENARIOS = ['Start', 'Inspecting', 'Checkpoint', 'Building', 'Rendering', 'Testing', 'Finished', 'Question', 'Stopped', 'Error', 'Credits', 'Disconnected', 'Restored'] as const;
type Scenario = typeof SCENARIOS[number];
const STEPS = [
  { tool: 'get_project_tree', summary: 'Inspecting the existing lobby', phase: 'inspecting' },
  { tool: 'create_checkpoint', summary: 'Saving the place before changes', phase: 'checkpointing' },
  { tool: 'create_instances', summary: 'Building the portal platform', phase: 'building' },
  { tool: 'render_view', summary: 'Rendering the updated geometry', phase: 'rendering' },
  { tool: 'run_and_check', summary: 'Checking the portal interaction', phase: 'playtesting' },
] as const;
const seeds = [
  { label: 'Portal lobby', prompt: 'Build a lobby with a portal.' },
  { label: 'Floating obby', prompt: 'Build an obstacle course with checkpoints.' },
  { label: 'Your first simulator', prompt: 'Build a coin simulator with an upgrade shop.' },
];

/** Local-only presentation fixtures. No backend, model calls, or Studio commands. */
export function StudioPreviewPage() {
  const [scenario, setScenario] = useState<Scenario>('Start');
  const [playing, setPlaying] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showStage, setShowStage] = useState(true);
  const { theme, setTheme } = useTheme();
  const { prefs, setPref } = usePrefs();
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setScenario(s => {
      const index = SCENARIOS.indexOf(s);
      if (index >= 6) { setPlaying(false); return s; }
      return SCENARIOS[index + 1] ?? s;
    }), 2400);
    return () => window.clearInterval(timer);
  }, [playing]);
  const activeIndex = Math.max(0, Math.min(4, SCENARIOS.indexOf(scenario) - 1));
  const terminal: StopReason | undefined = scenario === 'Finished' ? 'done' : scenario === 'Stopped' ? 'stopped' : scenario === 'Error' ? 'error' : scenario === 'Credits' ? 'quota' : undefined;
  const active = !terminal && !['Start', 'Question', 'Disconnected'].includes(scenario);
  const tools: ToolEvent[] = STEPS.slice(0, terminal ? 5 : activeIndex + 1).map((s, index) => ({
    toolId: `preview-${index}`, tool: s.tool, summary: s.summary, startedAt: 1000 + index * 3000,
    done: terminal !== undefined || index < activeIndex, ok: !(scenario === 'Error' && index === 4),
    startObserved: scenario !== 'Restored', durationMs: 2300,
  }));
  const activity = useMemo(() => {
    const events: ActivityEvent[] = tools.flatMap(t => {
      const start: ActivityEvent = { type: 'tool_start', at: t.startedAt, toolId: t.toolId, tool: t.tool, summary: t.summary };
      return t.done ? [start, { type: 'tool_end', at: t.startedAt + 2300, toolId: t.toolId, ok: t.ok !== false, summary: t.summary, durationMs: 2300 } as ActivityEvent] : [start];
    });
    if (terminal) events.push({ type: 'run_end', at: 17000, stopReason: terminal, error: scenario === 'Error' ? 'Illustrative Studio connection error.' : undefined });
    return reduceActivity({ events, now: 17000, streaming: active });
  }, [scenario]);
  return <main className="gx studio-preview">
    <header className="preview-toolbar">
      <strong>Apple / Experience lab</strong><span>ILLUSTRATIVE DEMO · NO STUDIO CHANGES</span>
      <button className="gx-btn" onClick={() => { setScenario('Start'); setPlaying(true); }}>Play sequence</button>
      <button className="gx-btn" onClick={() => setPlaying(false)}>Pause</button>
      <button className="gx-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Switch theme</button>
      <button className="gx-btn" aria-pressed={prefs.motion === 'reduced'} onClick={() => setPref('motion', prefs.motion === 'reduced' ? 'system' : 'reduced')}>Reduce motion</button>
    </header>
    <nav className="preview-scenarios" aria-label="Preview scenario">{SCENARIOS.map(s => <button key={s} className="gx-btn" aria-pressed={scenario === s} onClick={() => { setPlaying(false); setScenario(s); }}>{s}</button>)}</nav>
    <div className={`preview-workspace${showStage ? '' : ' preview-workspace--chat'}`}>
      <section className="preview-chat" aria-label="Conversation preview">
        <div className="preview-chat__heading"><span>Portal island</span><button className="gx-btn" onClick={() => setShowStage(v => !v)}>{showStage ? 'Hide project' : 'Show project'}</button></div>
        <div className="preview-chat__scroll">
          {scenario === 'Start' ? <ChatWelcome seeds={seeds} onSeed={setPrompt} /> : <>
            <p className="preview-request">Build a floating lobby with a glowing portal and a clear path to it.</p>
            {scenario === 'Question' ? <div className="preview-notice"><strong>One choice before we build</strong><p>Should the portal lead to another place or another area in this game?</p><button className="gx-btn" onClick={() => setScenario('Building')}>Another area in this game</button></div> : scenario === 'Disconnected' ? <div className="preview-notice"><strong>Studio disconnected</strong><p>The last result remains available. Reconnect Studio to continue.</p><button className="gx-btn" onClick={() => setScenario('Inspecting')}>Simulate reconnect</button></div> : <Thinking key={scenario === 'Restored' ? 'restored' : 'sequence'} tools={tools} status={{ phase: (STEPS[activeIndex] ?? STEPS[0]).phase }} streaming={active} gates={scenario === 'Finished' ? [{ key:'portal', label:'Portal interaction', passed:true }] : []} plannedSteps={[]} activity={activity} evidence={new Map()} />}
            {scenario === 'Finished' && <div className="preview-notice"><strong>Your next world has a starting point.</strong><p>The sample sequence is complete. In a real project, this area contains the reported changes and checks.</p></div>}
            {scenario === 'Restored' && <p>Restored-state illustration. No entry celebration is replayed.</p>}
          </>}
        </div>
        <form className="preview-composer" onSubmit={e => { e.preventDefault(); setScenario('Inspecting'); setPlaying(true); }}>
          <label htmlFor="preview-prompt">Describe your next idea</label><textarea id="preview-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A world with a secret worth finding…" />
          <div><span>Demo only · no Credits used</span><button className="gx-btn" type="submit">Try the sequence ↗</button></div>
        </form>
      </section>
      {showStage && <aside className={`preview-stage${active ? ' is-working' : ''}`} aria-label="Project concept preview">
        <header><span className="studio-eyebrow">PROJECT CANVAS</span><span>{active ? 'Sample activity' : 'Concept study'}</span></header>
        <div className="preview-stage__art"><ModelMark variant="apple" /></div>
        <div className="preview-stage__caption"><span className="studio-eyebrow">APPLE STUDIO</span><h2>A little thought.<br />A new possibility.</h2><p>Interface demonstration. Project geometry appears only when Studio supplies a diagnostic render.</p></div>
        <footer>INTERFACE STUDY <span>APPLE STUDIO</span></footer>
      </aside>}
    </div>
  </main>;
}
