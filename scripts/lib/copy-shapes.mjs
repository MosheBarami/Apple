// THE COMPETITOR SHAPES, in one place so scripts/check-copy.mjs and the site's share-surface guard read the same list.
// (Moved out of check-copy.mjs on 2026-10-05, unchanged but for the one widening noted on 'describe-it-then-builds-it'.)
//
// Not a script: it only exports SHAPES.

/**
 * The shapes, each quoted from the site it was found on.
 *
 * `re` matches the CONSTRUCTION, not the words — "describe it, watch it get built" and "you
 * describe the game, we build it" are the same sentence wearing different nouns, and a checker
 * that only caught the exact string would catch nothing the second time.
 */
export const SHAPES = [
  {
    id: 'describe-it-builds-it',
    re: /\b(describe|tell|type|say)\b[^.!?]{0,40}\b(and|then|,)\s*(we|it|studpilot|apple|ai|watch)\b[^.!?]{0,30}\b(build|make|create|come to life|get built)/i,
    found: 'revix.tech H1: "DESCRIBE IT. WATCH IT GET BUILT." · superbullet.ai: "Just describe what you want, and watch your game come to life."',
    why: 'It describes the INTERFACE, not the product. Every competitor says it, so it distinguishes nothing, and it promises a passivity the product does not have.',
  },
  {
    //[[ THE SAME CLAIM SPLIT ACROSS TWO SENTENCES, WHICH IS HOW EVERY RIVAL ACTUALLY WRITES IT.
    //
    //   The first rule needs the whole thing inside one sentence — `[^.!?]{0,40}` between the verb
    //   and the connective. revix.tech does not write it that way and neither did we: the app's
    //   own <title> was "Apple — Describe it. Apple builds it." and it passed all six rules,
    //   because the full stop in the middle is exactly what the first rule refuses to cross.
    //
    //   It sat in the browser tab of every screen of the signed-in product while this checker
    //   reported CLEAN, and it was found by reading the page rather than by running the check.
    id: 'describe-it-then-builds-it',
    //[[ WIDENED 2026-10-05: THE OBJECT OF "DESCRIBE" CAN BE A NOUN PHRASE, and the share card of this site carried exactly that. "Describe a
    //   Roblox game. StudPilot builds it." is the same promise in the same two-sentence shape, and the rule above needed `it`, `your`, `what` or
    //   `us` after the verb, so the card passed while the guard reported CLEAN (the card was not read at all; see pages()). ]]
    re: /\b(describe|tell|type|say)\s+(it|your|what|us|an?\s+(?:\w+\s+){0,2}(?:game|piece|idea|world))\b[^.!?]{0,30}[.!?]\s*(we|it|studpilot|apple|ai|the ai)\s+(?:\w+\s+){0,2}(build|make|create)/i,
    found: 'revix.tech H1: "DESCRIBE IT. WATCH IT GET BUILT." · this product\'s own app title, until it was read',
    why: 'Splitting it over two sentences does not make it a different sentence. It is the same promise, in the same shape, that three of the four rivals lead with.',
  },
  {
    // The back half of the same headline, standing on its own. The first rule needs a
    // describe/tell/type verb before it — and "Watch it build, step by step." was sitting as an h2
    // on this project's own landing page, which is revix.tech's H1 with the first sentence removed.
    id: 'watch-it-build',
    re: /\bwatch\s+(it|your|the)\b[^.!?]{0,30}\b(get\s+built|be(ing)?\s+built|build|come\s+to\s+life|appear)\b/i,
    found: 'revix.tech H1: "DESCRIBE IT. WATCH IT GET BUILT." · superbullet.ai: "watch your game come to life"',
    why: 'It casts the customer as an audience. What this product actually offers is the opposite — named steps and a stop button — and saying "watch" throws that away to sound like everyone else.',
  },
  {
    id: 'one-x-whole-y',
    re: /\bone\s+(prompt|sentence|line|message|idea)\b[^.!?]{0,40}\b(whole|full|entire|complete)\b/i,
    found: 'superbullet.ai: "turn one prompt into a full Roblox game" · promptblox.ai: "build a whole world in one prompt"',
    why: 'It is the claim the product cannot keep, said in the shape everybody says it in.',
  },
  {
    id: 'x-not-y',
    // Anchored on the PRODUCT as the subject. The first version matched "That is not a user ID —
    // it should look like the example above", a form validation message, which is the opposite of
    // marketing copy: it is a specific, useful sentence telling somebody exactly what to fix.
    re: /\b(studpilot|apple|we|this product|the product)\s+(is|are|['’]s|['’]re)\s+not\s+(a|an|just|merely|another)\b/i,
    found: 'revix.tech: "Revix is not a one-shot generator." · "MORE THAN CODE COMPLETION"',
    why: 'Defining yourself against a competitor spends your own headline on theirs.',
  },
  {
    /*
     * THE OTHER HALF OF "X not Y", and the half the owner actually kept naming.
     *
     * `x-not-y` above is anchored on the PRODUCT as subject — "Apple is not a one-shot generator"
     * — because its first version matched "That is not a user ID", a form message that is the
     * opposite of marketing copy. Narrowing it that far left the construction itself unguarded,
     * and the onboarding tour shipped with "Say what you want, not how to build it" while this
     * check printed CLEAN over 94 pages.
     *
     * This one is anchored on an imperative that OPENS the line — a quote mark, a JSX `>`, or the
     * start of a line — followed by a comma and a negation. That is the headline shape and not the
     * validation shape: a message telling somebody what they typed wrong does not begin with "Say"
     * or "Build".
     *
     * Opening position is load-bearing, not decoration. Without it this matched "Written into
     * every project you build, not just this one" in the instructions panel — a scope
     * clarification, specific and useful, where `build` is a relative-clause verb rather than an
     * instruction. A checker that flags the good sentence next to the bad one gets muted, which is
     * a slower way of not having it.
     */
    id: 'imperative-x-not-y',
    re: /(?:^|['"\u2018\u201c>]|\{\s*['"])\s*(say|tell|describe|ask|build|make|write|think|prompt)\b[^.!?\n]{0,48},\s*not\s+(how|what|where|why|when|the|a|an|just|another)\b/im,
    found: 'this product\'s own onboarding tour, until it was read',
    why: 'A line defined by what it is not spends itself on the thing it is refusing. The owner named this shape by hand, twice.',
  },
  {
    id: 'without-learning',
    re: /\bwithout\s+(learning|knowing|writing|touching)\b[^.!?]{0,20}\b(to\s+)?(code|scripting|luau|programming)\b/i,
    found: 'superbullet.ai H2, at 60px: "Make Roblox Games Without Learning To Code"',
    why: 'It sells the absence of work rather than the presence of a result, and it insults the people who did learn.',
  },
  {
    id: 'dream-vague',
    re: /\b(your\s+)?(dream|imagination|vision)\b[^.!?]{0,25}\b(world|game|reality|life)\b/i,
    found: 'promptblox.ai H1: "Create your Dream World" · subhead: "Turn your ideas and visions into playable Roblox games"',
    why: 'It could be any product in any category. A headline that survives a find-and-replace of the noun is not a headline.',
  },
];

