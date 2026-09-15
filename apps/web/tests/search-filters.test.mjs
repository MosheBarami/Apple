// The search filter contract, held from BOTH ends.
//
// The panel builds a query string; the worker parses it. They are two halves of one agreement
// about parameter names and value spellings, written in different packages by different hands, and
// when they disagree nothing fails: the server simply does not see the filter, searches everything,
// and returns a full result set that the user reads as the answer to their narrow question.
//
// Neither side's own tests can catch that. A web test asserting "we send types=message" passes
// against a server reading `kinds`; a worker test asserting "we read types" passes against a
// client sending `type`. So this file imports both modules and runs the real output of one through
// the real parser of the other.
import test from 'node:test';
import assert from 'node:assert/strict';

const web = await import('../src/lib/search-filters.ts');
const worker = await import('../../worker/src/search.ts');

const parse = (params) => worker.parseSearchFilter(params);
const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);

// ------------------------------------------------------------------ the vocabulary ---

test('every kind the panel offers is a kind the worker knows', () => {
  assert.deepEqual([...web.SEARCH_TYPES], [...worker.SEARCH_TYPES]);
});

test('every author the panel offers is one the worker accepts, and it offers no others', () => {
  // Not equality: the worker also carries 'system', which no user-visible record is written by, so
  // offering it as a filter would be a control that always returns nothing.
  for (const a of web.SEARCH_AUTHORS) assert.ok(worker.SEARCH_AUTHORS.includes(a), a);
  assert.equal(web.SEARCH_AUTHORS.includes('system'), false);
});

test('the panel and the worker agree on what is too short to search', () => {
  // A client floor below the server's sends requests that are refused and paints the refusal as
  // "no results"; a floor above it refuses queries the server would have answered.
  assert.equal(web.MIN_QUERY, worker.MIN_QUERY);
});

test('every kind has a label, so no facet can render blank', () => {
  for (const t of web.SEARCH_TYPES) assert.equal(typeof web.TYPE_LABELS[t], 'string');
  for (const r of web.DATE_RANGES) assert.equal(typeof web.RANGE_LABELS[r], 'string');
});

// ----------------------------------------------------------- what the server receives ---

test('an unfiltered panel asks for everything, and the worker hears everything', () => {
  const f = parse(web.searchParams(web.EMPTY_FILTER, 'door', NOW));
  assert.deepEqual(f.types, [...worker.SEARCH_TYPES]);
  assert.deepEqual(f.authors, [...worker.SEARCH_AUTHORS]);
  assert.equal(f.from, null);
  assert.equal(f.to, null);
  assert.deepEqual(f.ignored, []);
  assert.equal(f.impossible, false);
});

test('the kinds chosen in the panel are the kinds the worker searches', () => {
  let filter = web.toggleType(web.EMPTY_FILTER, 'checkpoint');
  filter = web.toggleType(filter, 'memory');
  const f = parse(web.searchParams(filter, 'door', NOW));
  assert.deepEqual(f.types, ['checkpoint', 'memory']);
  assert.deepEqual(f.ignored, [], 'a value the panel offers must never come back as unreadable');
});

test('the author chosen in the panel is the author the worker filters on', () => {
  const f = parse(web.searchParams(web.toggleAuthor(web.EMPTY_FILTER, 'you'), 'door', NOW));
  assert.deepEqual(f.authors, ['you']);
  assert.deepEqual(f.ignored, []);
});

test('toggling a kind off returns to everything, not to nothing', () => {
  // The state between them is the dangerous one: an empty selection meaning "no kinds" would match
  // nothing at all, and the panel would look broken rather than unfiltered.
  const on = web.toggleType(web.EMPTY_FILTER, 'message');
  const off = web.toggleType(on, 'message');
  assert.deepEqual(off.types, []);
  const f = parse(web.searchParams(off, 'door', NOW));
  assert.deepEqual(f.types, [...worker.SEARCH_TYPES]);
  assert.equal(f.impossible, false);
});

// ------------------------------------------------------------------------ the dates ---

for (const [range, span] of [['day', 86_400_000], ['week', 7 * 86_400_000], ['month', 30 * 86_400_000]]) {
  test(`the "${range}" preset sends a bound the worker reads as exactly that window`, () => {
    const f = parse(web.searchParams({ ...web.EMPTY_FILTER, range }, 'door', NOW));
    assert.equal(f.from, NOW - span);
    assert.equal(f.to, null);
    assert.deepEqual(f.ignored, [], 'a preset the panel offers must never be unreadable');
    assert.equal(f.impossible, false);
  });
}

test('a custom day range covers both days end to end', () => {
  const filter = { ...web.EMPTY_FILTER, range: 'custom', from: '2026-03-01', to: '2026-03-31' };
  const f = parse(web.searchParams(filter, 'door', NOW));
  assert.equal(f.from, Date.UTC(2026, 2, 1, 0, 0, 0, 0));
  assert.equal(f.to, Date.UTC(2026, 2, 31, 23, 59, 59, 999), 'the last day must be included whole');
  assert.equal(f.impossible, false);
});

test('a custom range with only one end sends only that end', () => {
  const f = parse(web.searchParams({ ...web.EMPTY_FILTER, range: 'custom', from: '', to: '2026-03-31' }, 'door', NOW));
  assert.equal(f.from, null);
  assert.equal(f.to, Date.UTC(2026, 2, 31, 23, 59, 59, 999));
});

test('choosing "Between…" and filling nothing in searches all of time rather than nothing', () => {
  const f = parse(web.searchParams({ ...web.EMPTY_FILTER, range: 'custom' }, 'door', NOW));
  assert.equal(f.from, null);
  assert.equal(f.to, null);
  assert.equal(f.impossible, false);
});

// --------------------------------------------------------------- what "filtered" means ---

test('the filters-are-on marker tells the truth in both directions', () => {
  assert.equal(web.isFiltered(web.EMPTY_FILTER), false);
  assert.equal(web.isFiltered(web.toggleType(web.EMPTY_FILTER, 'message')), true);
  assert.equal(web.isFiltered(web.toggleAuthor(web.EMPTY_FILTER, 'apple')), true);
  assert.equal(web.isFiltered({ ...web.EMPTY_FILTER, range: 'week' }), true);
  assert.equal(web.isFiltered({ ...web.EMPTY_FILTER, range: 'custom' }), false, 'an empty custom range narrows nothing');
  assert.equal(web.isFiltered({ ...web.EMPTY_FILTER, range: 'custom', from: '2026-03-01' }), true);
});

// ------------------------------------------------------------- what was stored before ---

test('a stored filter from an older build cannot poison a search', () => {
  // The panel restores its filters from localStorage. A type that no longer exists would be sent,
  // refused by the worker, and every search from that browser would return nothing with an
  // explanation naming a filter the user never set.
  const stored = { types: ['message', 'sonnet'], authors: ['you', 'nobody'], range: 'fortnight', from: 'soon', to: '2026-03-31' };
  const filter = web.normaliseFilter(stored);
  assert.deepEqual(filter.types, ['message']);
  assert.deepEqual(filter.authors, ['you']);
  assert.equal(filter.range, 'any');
  assert.equal(filter.from, '');
  const f = parse(web.searchParams(filter, 'door', NOW));
  assert.deepEqual(f.ignored, []);
  assert.equal(f.impossible, false);
});

test('a stored value that is not a filter at all restores as no filter', () => {
  for (const junk of [null, 'door', 42, [], { types: 'message' }]) {
    const f = web.normaliseFilter(junk);
    assert.deepEqual(f.types, [], JSON.stringify(junk));
    assert.equal(f.range, 'any');
  }
});

test('a filter that survives normalisation survives a round trip through storage', () => {
  const filter = { types: ['artifact'], authors: ['apple'], range: 'custom', from: '2026-03-01', to: '2026-03-31' };
  assert.deepEqual(web.normaliseFilter(JSON.parse(JSON.stringify(filter))), filter);
});
