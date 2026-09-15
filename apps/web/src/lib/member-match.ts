// Finding a person in a member list.
//
// The server filters (`?q=` on /api/shared/:id/members, matched against handle, display name and
// id) and returns the page in a stable order — owner first, then by handle. That order is right for
// browsing and wrong for searching: typing `sam` puts `alexander` above `sam` whenever alphabet
// and relevance disagree, which for a search box is every time.
//
// So the page is ORDERED here, by how well each member answers the query, while the server stays
// the authority on WHICH members match — the list may be longer than the page, and a client-side
// filter over one page would answer "no such member" about someone on the next.
//
// The tiers are the ones a name search needs, and they are ordered by how certain the match is:
// the whole handle, the start of it, the start of any word inside it, and finally anywhere at all.
// An id match is last, because an id is what you paste when you already know it.

export interface MemberLike {
  userId: string;
  handle: string;
  displayName: string | null;
}

export const MATCH_TIERS = ['exact', 'prefix', 'word', 'substring', 'id', 'none'] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

const TIER_RANK: Record<MatchTier, number> = { exact: 0, prefix: 1, word: 2, substring: 3, id: 4, none: 5 };

const WORD_BREAK = /[^\p{L}\p{N}]+/u;

/** How well one name answers one query. */
export function tierFor(name: string | null, query: string): MatchTier {
  const q = query.trim().toLowerCase();
  if (!q) return 'none';
  const n = (name ?? '').toLowerCase();
  if (!n) return 'none';
  if (n === q) return 'exact';
  if (n.startsWith(q)) return 'prefix';
  if (n.split(WORD_BREAK).some((w) => w.startsWith(q))) return 'word';
  if (n.includes(q)) return 'substring';
  return 'none';
}

/** The best tier any of a member's names reaches. */
export function memberTier(member: MemberLike, query: string): MatchTier {
  const q = query.trim().toLowerCase();
  if (!q) return 'none';
  let best: MatchTier = 'none';
  for (const name of [member.handle, member.displayName]) {
    const tier = tierFor(name, query);
    if (TIER_RANK[tier] < TIER_RANK[best]) best = tier;
  }
  // An id is matched as a whole or not at all: a four-character fragment of a UUID is a
  // coincidence, not a search result, and it would outrank real name matches for short queries.
  if (best === 'none' && member.userId.toLowerCase() === q) return 'id';
  return best;
}

/**
 * Order a page of members by how well they answer the query.
 *
 * An empty query returns the input ORDER UNCHANGED — the server's order is the browse order, owner
 * first, and re-sorting it alphabetically here would quietly move the owner out of the top row.
 *
 * Ties keep their incoming order, so the result is stable: two members with the same tier stay in
 * the order the roster returned them, and the list does not reshuffle as you type.
 */
export function rankMembers<T extends MemberLike>(members: readonly T[], query: string): T[] {
  if (!query.trim()) return [...members];
  return members
    .map((member, i) => ({ member, i, tier: memberTier(member, query) }))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.i - b.i)
    .map((x) => x.member);
}
