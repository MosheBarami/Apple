// WHAT A REPLY MAY SHOW, AND WHERE EVERYTHING ELSE GOES (owner decision D-UX-2).
//
// Apple is for young creators who are not technical. The reply says what changed in plain words;
// plan checklists, property and instance cards, diff tables, test tables and tool detail are not
// drawn in the conversation. They are kept — hiding output the run really produced is how a product
// starts lying about what happened — one click away, under Details inside the Thinking disclosure.
//
// What stays in the reply is what the person asked to SEE: an image or a sound Apple made for them.
// That is decided by the file it points at (a path this app generated, the same check that decides
// whether it gets a player), never by what the block calls itself.
import { parseAudioPath, parseImagePath } from './api';
import type { AssetPickerBlock, Block, UIDocument } from './generative-ui/schema';

/**
 * Never drawn in the conversation at all, in either place: renders and before/after scenes have
 * their own surface (the playtest card and the work surface), and the reply never carried them.
 */
const NOT_IN_THE_CONVERSATION: ReadonlySet<Block['type']> = new Set(['render_review', 'scene_comparison']);

/** An image or a sound Apple generated for this person — every asset of it, or it is detail. */
export function isGeneratedMedia(block: Block): block is AssetPickerBlock {
  if (block.type !== 'asset_picker' || block.assets.length === 0) return false;
  return block.assets.every((asset) =>
    (asset.kind === 'image' && asset.thumbnail !== undefined && parseImagePath(asset.thumbnail.src) !== null) ||
    (asset.kind === 'sound' && asset.link !== undefined && parseAudioPath(asset.link.href) !== null),
  );
}

/** Split validated documents into what the reply shows and what Details holds. Order is kept. */
export function splitReplyDocs(docs: readonly UIDocument[]): { media: UIDocument[]; details: UIDocument[] } {
  const media: UIDocument[] = [];
  const details: UIDocument[] = [];
  for (const doc of docs) {
    const shown = doc.blocks.filter((block) => !NOT_IN_THE_CONVERSATION.has(block.type));
    const pictures = shown.filter(isGeneratedMedia);
    const rest = shown.filter((block) => !isGeneratedMedia(block));
    if (pictures.length) media.push({ ...doc, blocks: pictures });
    if (rest.length) details.push({ ...doc, blocks: rest });
  }
  return { media, details };
}
