# Owner corpus source brief — 2026-09-27

Implemented `packages/owner-corpus/source_brief.py`, a read-only JSON brief for one exact source SHA. It queries only source-scoped indexed rows, caps candidate lists, and paginates top-level roots and script records. It returns original identity and CAS paths, exact class/instance/service/script/dependency counts, and explicit UI/model/script IDs. Names and path-derived client/server/module labels are marked as hints. It never parses normalized XML or executes Source.

## Measured readback

- Source: `building_simulator.rbxl`, SHA-256 `7979acb835495806548ffc9ff6d16d3b7a34b8d428e699602b32ca5bc309fd7d`.
- Read once from the preserved original object: 1,132,581 bytes; computed SHA matched the indexed identity.
- Indexed structure: 13,295 instances; 626 script records (31 client-placement hints, 33 server-placement hints, 562 module-placement hints); 737 dependency references.
- A bounded output page returned three exact top-level IDs and four script IDs with a next offset of 4. UI/model candidates are capped at 200 each and report truncation.
- Exact media count was left unavailable: the existing `media` table has no `node_id` index, and counting one source would scan that corpus-wide table. The JSON explains this rather than initiating the scan.
- `python3 -m py_compile packages/owner-corpus/source_brief.py` passed. No corpus-wide tests were run.
