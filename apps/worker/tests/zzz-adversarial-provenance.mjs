import { projectAssets } from '../src/provenance.ts';

// ---- fake D1 --------------------------------------------------------------
function makeD1({ hasLibrary, rows, failWith }) {
  const log = [];
  return {
    log,
    prepare(sql) {
      log.push(sql);
      return {
        bind(...args) {
          return {
            async all() {
              if (failWith) throw failWith;
              if (/left join asset_library/.test(sql) && !hasLibrary) {
                throw new Error('D1_ERROR: no such table: asset_library: SQLITE_ERROR');
              }
              // emulate SQLite column naming for both queries
              const joined = /left join asset_library/.test(sql);
              return {
                results: rows.map((r) => {
                  if (joined) return r;
                  // UNJOINED: library cols forced to null
                  const out = { ...r };
                  for (const k of ['name','kind','source','source_url','licence','licence_url','commercial_use','attribution_required','author','retrieved_at','imported_at','modifications','roblox_asset_id','tags','sha256']) out[k] = null;
                  return out;
                }),
              };
            },
          };
        },
      };
    },
  };
}

const USE = {
  asset_id: 'unaccounted:roblox:123',
  first_used_at: 'a', last_used_at: 'b', uses: 2, via_live_api: 1, context: 'Workspace',
  name: 'Rock', kind: 'prop', source: 'kenney', source_url: 'u', licence: 'CC0-1.0',
  licence_url: 'lu', commercial_use: 1, attribution_required: 0, author: 'K',
  retrieved_at: 'r', imported_at: 'i', modifications: '["scaled"]', roblox_asset_id: 9,
  tags: '["rock"]', sha256: 'h',
};

let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };

// 1. Library present -> joined path, provenance populated
{
  const out = await projectAssets({ CORPUS: makeD1({ hasLibrary: true, rows: [USE] }) }, 'p1');
  check('joined: provenance present', out[0].provenance !== null);
  check('joined: commercialUse true', out[0].provenance?.commercialUse === true);
  check('joined: viaLiveApi true', out[0].use.viaLiveApi === true);
}

// 2. Library missing -> fallback, provenance null, no throw
{
  const d1 = makeD1({ hasLibrary: false, rows: [USE] });
  const out = await projectAssets({ CORPUS: d1 }, 'p1');
  check('fallback: did not throw', true);
  check('fallback: provenance null', out[0].provenance === null);
  check('fallback: use fields survive', out[0].use.assetId === 'unaccounted:roblox:123' && out[0].use.uses === 2 && out[0].use.viaLiveApi === true);
  check('fallback: ran UNJOINED second', d1.log.length === 2 && !/left join/.test(d1.log[1]));
}

// 3. Non-missing-table error must re-throw
{
  let threw = null;
  try {
    await projectAssets({ CORPUS: makeD1({ hasLibrary: true, rows: [], failWith: new Error('D1_ERROR: Network connection lost') }) }, 'p1');
  } catch (e) { threw = e; }
  check('timeout re-throws', threw !== null, String(threw && threw.message));
}

// 4. Non-Error throw (D1 sometimes rejects with a string / object)
{
  let threw = null;
  try {
    await projectAssets({ CORPUS: makeD1({ hasLibrary: true, rows: [], failWith: 'no such table: asset_library' }) }, 'p1');
  } catch (e) { threw = e; }
  check('string throw containing no-such-table is caught (falls back)', threw === null, String(threw));
}

// 5. Error whose .message is empty but whose cause carries the text (workerd wrapping)
{
  const e = new Error('');
  e.cause = new Error('no such table: asset_library');
  let threw = null;
  try {
    await projectAssets({ CORPUS: makeD1({ hasLibrary: true, rows: [], failWith: e }) }, 'p1');
  } catch (err) { threw = err; }
  check('empty-message error with cause: re-thrown (NOT caught)', threw !== null, '<- expected: message-only match');
}

// 6. project_asset_use itself missing -> second query throws too
{
  const d1 = {
    prepare(sql) { return { bind() { return { async all() { throw new Error('D1_ERROR: no such table: project_asset_use: SQLITE_ERROR'); } }; } }; },
  };
  let threw = null;
  try { await projectAssets({ CORPUS: d1 }, 'p1'); } catch (e) { threw = e; }
  check('both tables missing -> still throws (500)', threw !== null, String(threw && threw.message));
}

// 7. commercial_use = 0 in fallback shape -> === 1 comparisons
{
  const row = { ...USE, name: null, source: null, licence: null, commercial_use: null, attribution_required: null, via_live_api: 0 };
  const out = await projectAssets({ CORPUS: makeD1({ hasLibrary: true, rows: [row] }) }, 'p1');
  check('null cols -> provenance null, viaLiveApi false', out[0].provenance === null && out[0].use.viaLiveApi === false);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
