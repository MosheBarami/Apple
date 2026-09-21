import { ModelMark } from './model-mark';

export function ChatWelcome({ seeds, onSeed }: {
  seeds: readonly { label: string; prompt: string }[];
  onSeed: (prompt: string) => void;
}) {
  return <section className="start-sheet aw-launchpad" aria-labelledby="start-title">
    <div className="aw-launchpad__orbit" aria-hidden="true">
      <span className="aw-launchpad__ring aw-launchpad__ring--one" />
      <span className="aw-launchpad__ring aw-launchpad__ring--two" />
      <span className="aw-launchpad__beam" />
    </div>
    <div className="start-sheet__lead aw-launchpad__lead">
      <span className="start-sheet__identity aw-launchpad__identity">
        <ModelMark variant="apple" />
        <span className="aw-launchpad__eyebrow">APPLE · ROBLOX STUDIO</span>
      </span>
      <h1 id="start-title">Build the next state of your world.</h1>
      <p>Describe the feeling, system, map or mechanic. Apple reads the place you already have open and works from there.</p>
    </div>
    <div className="start-sheet__ideas aw-launchpad__ideas">
      {seeds.map((seed, index) => <button key={seed.prompt} onClick={() => onSeed(seed.prompt)}>
        <span className="aw-launchpad__idea-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className="aw-launchpad__idea-label">{seed.label}</span>
        <span className="aw-launchpad__idea-arrow" aria-hidden="true">↗</span>
      </button>)}
    </div>
  </section>;
}
