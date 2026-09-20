# Handoff — the landing's JavaScript budget has never measured any JavaScript

Written 2026-09-21 by the design lane. `scripts/check-landing-budget.mjs` is another lane's file and
was edited earlier today (`1bc1e44`), so this is a report rather than an edit.

## The finding

`check-landing-budget.mjs` prints

```
  JavaScript (raw)                                   0 B
```

and enforces `ALLOW_JS_BYTES = 0` — "the root route ships no JavaScript, full stop".

**The root route ships 31,946 raw bytes of JavaScript.** Measured on the build at commit `f2f7ec1`:

| | |
|---|---|
| `<script>` tags in `dist/index.html` | 7 |
| of those with a `src` attribute | **0** |
| inline script bytes, raw | **31,946** |
| `index.html`, raw | 60,953 |
| `index.html`, gzip | 19,753 |
| `index.html` gzip with every `<script>` removed | 8,247 |

So roughly **11,506 of the page's 19,753 gzipped bytes are script**, and the line that budgets
script reports zero.

## Why it reads zero

Line 31 of the checker:

```js
const linked = [...html.toString().matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))"/g)].map((m) => m[1]);
```

and line 41:

```js
if (asset.endsWith('.js')) jsBytes += raw.length;
```

It counts only `.js` files the document LINKS. Astro inlines a page's bundled module script when it
is small enough, and `astro.config.mjs` sets `build.inlineStylesheets: 'auto'` alongside it, so
every script on this route is inline and none is linked. The regex matches nothing, `jsBytes` stays
0, and `0 > 0` is false.

This is the shape the whole repository is written against: a failure to observe rendering as an
observation. The gate is not loose — it has never looked.

## What this lane added, stated plainly

The four interactive capability stages, the custom cursor and the real hero form are the bulk of
tonight's script. The page's markup-and-stylesheet total moved

| | gzip |
|---|---|
| `8b61c91`, before any of tonight's design work | 21,042 B |
| `f2f7ec1`, after it | 26,956 B |
| the budget | 12,000 B |

The budget was already exceeded by 75% before this lane touched anything; it is now exceeded by
125%. Neither number is defended here — they are stated so that the attribution is not something
somebody has to reconstruct.

## What not to do

**Do not raise `BUDGET_GZIP_BYTES` to meet the page.** The comment added at `1bc1e44` already
decided that, in the same words this file would use: "raising a failing number to meet the page is
how a gate becomes a decoration." The same applies to `ALLOW_JS_BYTES`.

## What to do, in order

1. **Make the instrument see inline script.** Sum the bodies of every `<script>` without a `src` as
   well as the linked `.js` files. Until this lands, any number chosen for `ALLOW_JS_BYTES` is a
   number about nothing.
2. **Then decide `ALLOW_JS_BYTES` deliberately.** `0` encodes a decision — "one viewport of HTML and
   CSS with no JavaScript at all" — that has been reversed in the code for a long time and by the
   owner explicitly: the theme toggle, the reveal observer, the interface-sound synth and the
   horizon canvas all predate tonight, and the standing design brief asks for interactive feature
   demos, a custom cursor and branded loading. Whoever sets the new number should record the
   arithmetic beside it the way the image budget's author did.
3. **Then decide whether the page should be lighter.** That is a separate question from whether the
   gate can see, and it should not be answered by a gate that cannot.

## How to reproduce the measurement

```
cd apps/site && npx astro build
node -e "const {readFileSync}=require('node:fs');const {gzipSync}=require('node:zlib');
const h=readFileSync('apps/site/dist/index.html','utf8');
const s=[...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
console.log({tags:s.length,withSrc:s.filter(([,a])=>/\bsrc=/.test(a)).length,
 inlineRaw:s.filter(([,a])=>!/\bsrc=/.test(a)).reduce((n,[,,b])=>n+Buffer.byteLength(b),0),
 gzip:gzipSync(h,{level:9}).length,
 gzipNoScripts:gzipSync(Buffer.from(h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')),{level:9}).length});"
```
