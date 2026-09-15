import { AppleGlyph } from '../glyphs';

/**
 * WHAT A NEW CONVERSATION LOOKS LIKE.
 *
 * It was the app's generic EmptyState: an icon, a heading, a paragraph and three full-sentence
 * buttons stacked in the top-left of a very tall empty column. Every one of those is correct for a
 * drawer that has no rows in it, and wrong here — this is not an absence of data, it is the moment
 * before the first thing is said, and it is the screen a person looks at longest before deciding
 * whether this product is serious.
 *
 * THE COMPOSITION IS ONE IDEA: a light, and a question under it. Centred on the column's own axis
 * rather than the top, because a person's eye goes to the middle of an empty space and the
 * composer is directly below — so the line they read and the box they type in are one movement
 * apart, not a page apart.
 *
 * THE BLOOM IS A LAYER, NOT A SHADOW ON THE GLYPH. A box-shadow would scale with the mark and clip
 * to its box; this is a radial that reaches well past it, which is what makes it read as a light
 * source in a dark room rather than as a glowing icon. Under prefers-reduced-motion it stops
 * breathing and stays at its resting size, so the composition is complete either way.
 *
 * THE SEEDS ARE PILLS, NOT SENTENCES IN BUTTONS. Three full instructions stacked vertically read
 * as a form to fill in. Shortened to the move each one makes, they read as a way in — and the
 * prompt they actually insert is still the whole sentence, because a seed that inserts three words
 * leaves the person with more typing than they started with.
 */
export function ChatWelcome({
  seeds,
  onSeed,
}: {
  /** label is what the pill says; prompt is what lands in the composer. */
  seeds: readonly { label: string; prompt: string }[];
  onSeed: (prompt: string) => void;
}) {
  return (
    <div className="cw">
      <span className="cw__bloom" aria-hidden="true" />
      <div className="cw__inner">
        <span className="cw__mark" aria-hidden="true">
          <AppleGlyph size={34} />
        </span>
        {/* Not "Welcome back" and not the product's name. The only sentence that belongs on an
            empty conversation is the one that asks for the next input. */}
        <h2 className="cw__line">What should we build?</h2>
        <p className="cw__sub">
          Apple reads your place before it touches it, takes a checkpoint, then works — and you can
          stop it mid-run.
        </p>
        <div className="cw__seeds">
          {seeds.map((s) => (
            <button key={s.prompt} type="button" className="cw__seed" onClick={() => onSeed(s.prompt)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
