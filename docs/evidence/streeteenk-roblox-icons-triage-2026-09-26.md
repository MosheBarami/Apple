# Streeteenk Roblox icons, owner priority #36, 2026-09-26

The [official itch.io listing](https://streeteenk.itch.io/generic-icon-pack) says the icons were designed for the Roblox obby Corridor of Rage. The inspected preview shows colorful, thick-outlined game icons. The author advertises colored and grayscale PNG and SVG variants, 512×512 PNGs, and a Figma file in `Icon Pack @Streeteenk.zip` (11 MB).

The author calls the pack open source and says attribution is optional. No named license granting Apple SaaS redistribution was found on the visible listing. The Robux icon is expressly attributed to Roblox Corporation and limited to Roblox experiences. These claims require per-file confirmation if the archive becomes available; no files have been audited.

The official “No thanks, just take me to the downloads” route was used in both the in-app browser and Chrome. Clicking the ZIP Download button produced “Thanks for downloading” in the in-app browser, but no matching archive was found in the expected local download or tool artifact locations. A popup is not a file receipt: downloaded bytes, hash, extraction count and backend-ready count are all unverified. No payment, upload, Studio import or code execution occurred.

The local dashboard records `download-not-verified`, with a Hebrew label, and the advertised archive remains separate from verified review files. It does not add this pack to the downloaded-file count.

## Verified recovery, later in the same date

The rendered official Download button was observed issuing a public POST to `/generic-icon-pack/file/5611382`, with the site's normal CSRF form. A fresh anonymous HTTP session fetched the public listing and submitted that form, without reading or forwarding the owner's browser cookies, account credentials or headers. The returned official file URL supplied a valid ZIP. Temporary signed URLs and form tokens were not recorded.

`review/owner-36/Icon Pack @Streeteenk.zip`: **12,464,780 bytes**, SHA-256 `fe630454e025b7ab81299927e5c8914a439de3ea51209e7e0aba38bdeaa94b04`. ZIP CRC verification passed. All 201 member files were extracted with path traversal and symlink rejection, and hashed separately: 49 icons in four PNG/SVG colored/grayscale variants (196 files), four promotional PNGs and one Figma document. Extracted bytes total 14,071,569. No executable files were present. A static SVG scan found zero script, event-handler, external entity, foreignObject or HTTP/javascript href patterns; this is not a full SVG security audit. A promotional PNG was visually inspected. No SVG, Figma code or third-party scripts were executed.

The source is now `local-review-only`. The dashboard lists the archive and 201 extracted files separately with individual hashes, bytes and acquisition method, so extraction is not mislabeled as a direct file download. No Apple backend redistribution right, permanent Roblox upload or live Studio insertion is claimed. Rights remain as above. The initial failed browser attempt remains documented for traceability.
