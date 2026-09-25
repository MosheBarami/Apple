# Creator Store installation path, 2026-09-25

At about 08:42 UTC the Apple Studio asset page was opened in Chrome signed in as
Herobrine583522. Roblox rendered “We couldn't find the page you were looking for”
and “404 Page Not Found” for asset `107230158271368`.

The public toolbox details endpoint was probed in the same run:

| Asset | Result |
|---|---:|
| Apple Studio `107230158271368` | 404 |
| Rojo 7 `6415005344` | 200 |
| Moon Animator 2 `4725618216` | 200 |
| Retired Golem plugin `132128477945417` | 404 |

The two listed controls show this endpoint still distinguishes distributed
plugins from unavailable assets. The page shell itself returns HTTP 200, so
its rendered 404 and the toolbox response matter more than that shell status.
Studio accepted the 1.4.0 overwrite earlier, but upload acceptance is separate
from public distribution. These observations do not identify the cause. Q-020
remains for the publisher account's distribution setting or Roblox's decision.

The shared `STUDIO_PLUGIN_STORE_LIVE` flag was set false. Install affordances
therefore lead to `/docs/plugin` instead of a broken Store URL, and `/status`
reopens “Studio plugin installation is unavailable.” The test that ties the
flag to the known issue failed before reopening the issue and passed afterward.
The site build and all 316 site tests passed; web TypeScript and all 2,428 web
tests passed. Commit `95dcd65` was built from a clean Git export and deployed
with `infra/deploy-static.mjs --only site` and `--only web`. The deployer checked
all 115 site files and 38 app files against the bytes served by the worker.
At about 08:48 UTC, a fresh browser visit to the live homepage showed a
"Plugin availability" link to `/docs/plugin`; that page showed "Public
installation is unavailable right now"; and `/status` listed "Studio plugin
installation is unavailable" as open since 25 September. The app routes to
the same availability path through the shared flag; this was covered by the
web build/tests and byte verification, not an authenticated browser session.
