// WHAT A DROP WILL DO, SAID WHILE THE FILE IS STILL IN THE AIR. Two UI Layouts picks (MIT), merged:
//
//   "File Upload"                     the dashed zone with the cloud-and-arrow and the one line that
//                                     says which files it takes.
//   "File Upload Chat Form Dropzone"  the whole message box is the zone — no separate target to aim
//                                     for — and a dropped file lands as a tile on the message.
//
// The zone is the card itself (PromptInput takes the drop; composer.tsx only lights the edge), so
// this is the words and the picture laid over it while a file-carrying drag is over the box. The
// accepted kinds are the shared allowlist's own, in plain words. It never takes the pointer.
import './drop-hint.css';

export function DropHint({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="pk-drop" aria-hidden="true">
      <svg className="pk-drop__art" viewBox="0 0 20 16" fill="none">
        <path
          d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <span className="pk-drop__title">Drop to attach</span>
      <span className="pk-drop__kinds">Text, Markdown, CSV, JSON or Luau files</span>
    </span>
  );
}
