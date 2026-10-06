-- The StudPilot Library in D1 (master plan §4.1 L7). Metadata only; binaries in R2 studpilot-media/library/.
CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,               -- e.g. kenney:nature-kit:tree_oak, cs:1234567
  title TEXT NOT NULL,
  kind TEXT NOT NULL,                -- item.mjs KINDS
  family TEXT,                       -- one pack or one creator style (L6)
  themes TEXT NOT NULL DEFAULT '[]', -- JSON array
  description TEXT,                  -- from the source's own words and thumbnail only (L7)
  source_url TEXT NOT NULL,
  author TEXT NOT NULL,
  licence_words TEXT NOT NULL,
  licence_class TEXT NOT NULL,
  licence_url TEXT NOT NULL,
  attribution TEXT,
  fetched_at TEXT NOT NULL,
  file_sha256 TEXT,
  roblox_asset_id INTEGER,
  uploader TEXT NOT NULL,            -- creator_store | studpilot_group | user_account | none
  ai_check TEXT NOT NULL,            -- JSON { pass, reasons, checked_at }
  sanitize TEXT,                     -- JSON report of sanitize.luau
  size_studs TEXT,                   -- JSON [x, y, z]
  triangles INTEGER,
  colours TEXT NOT NULL DEFAULT '[]',
  grade TEXT,                        -- A | B | C (L5); only A and B reach the model
  grade_notes TEXT,                  -- JSON: the two critics' grades and reasons
  load_test TEXT,                    -- JSON { ok, place, at } (L8)
  maturity TEXT,                     -- Minimal | Mild (L4)
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_items_kind ON library_items (kind, grade);
CREATE INDEX IF NOT EXISTS library_items_family ON library_items (family);
CREATE TABLE IF NOT EXISTS library_sources (
  id TEXT PRIMARY KEY,               -- one row per source in planning/library/SOURCES.md
  url TEXT NOT NULL,
  licence_class TEXT NOT NULL,
  categories TEXT NOT NULL,          -- JSON array of §4.3 category numbers
  dropped_reason TEXT                -- set when the source is dropped (an AI item found, a licence change)
);
