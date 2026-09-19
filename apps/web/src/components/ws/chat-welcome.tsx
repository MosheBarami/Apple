import { ModelMark } from './model-mark';

export function ChatWelcome({ seeds, onSeed }: {
  seeds: readonly { label: string; prompt: string }[];
  onSeed: (prompt: string) => void;
}) {
  return <section className="start-sheet" aria-labelledby="start-title">
    <div className="start-sheet__lead">
      <span className="start-sheet__identity"><ModelMark variant="apple" /></span>
      <h1 id="start-title">What would you like to build?</h1>
      <p>Bring your next idea to life in Roblox Studio.</p>
    </div>
    <div className="start-sheet__ideas">
      {seeds.map(seed => <button key={seed.prompt} onClick={() => onSeed(seed.prompt)}>
        <span>{seed.label}</span><span aria-hidden="true">↗</span>
      </button>)}
    </div>
  </section>;
}
