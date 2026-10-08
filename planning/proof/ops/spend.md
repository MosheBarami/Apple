# Workers AI spend log (`GET /api/admin/spend`)

Budget for test runs: ≤ $20 a month (plan §4.4). Figures are copied from the endpoint, not estimated.
`billable` excludes Cloudflare's 10,000 free neurons a day; $ = billable × $0.011/1000.

| When (IDT) | Why | Day billable neurons | Day $ | Month billable neurons | Month $ | Caps in force (day / month billable) |
|---|---|---|---|---|---|---|
| 2026-10-04 17:5x | M0 start, before any change | 80,257 | 0.88 | 356,384 | 3.92 | 1,000,000,000 / 30,000,000,000 (lifted) |
| 2026-10-04 19:0x | after the M0 deploy (71aa6776) | 80,257 | 0.88 | 356,384 | 3.92 | 150,000 / 2,270,000 (restored) |

| 2026-10-08 18:57:53 | before AI provider API probes | not exposed (total day neurons 8002) | not exposed | 655,559 | 7.2111 | 300,000 / 2,270,000 |
| 2026-10-08 19:07:56 | after one inference and the 5-case matrix; direct API usage separate below | not exposed (total day neurons 8002) | not exposed | 655,559 | 7.2111 | 300,000 / 2,270,000 |

2026-10-08 AI provider checks: Cloudflare REST calls on the existing authorized development account returned actual usage.
The endpoint above does not track those direct API calls, so its unchanged total is not a zero-cost claim.
At published undiscounted token rates, the one OK probe estimates $0.0000271 and the 5-case matrix estimates $0.0004125 (combined $0.0004396).
These are token-price estimates, not invoice totals; free allocation/cache discounts may change the bill. No token, account id or prompt output is logged here.
Source: planning/proof/ai-providers/cloudflare-runtime.json and cloudflare-matrix.json.

- 2026-10-08T17:06:35Z to 17:13:02Z: opt-in local HTTPS Worker boundary check using the existing authorized Cloudflare account. Real JWT, encrypted connection, discovery69, inference74/41 tokens and native tool probe135/41 tokens passed; temporary connection removed. Published token-price estimate $0.0000664, not an invoice. BudgetDO month estimate was $7.5926 before and $8.8832 after; unrelated owner activity was running, and direct REST BYOK calls are outside that ledger, so the difference is not attributed to this probe. No purchase, new token, new infrastructure or Studio mutation. Earlier local discovery attempts failed before inference because pinned workerd rejected redirect:error; manual redirect handling fixed that measured boundary.
