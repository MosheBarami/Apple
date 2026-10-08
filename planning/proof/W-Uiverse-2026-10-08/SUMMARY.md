# Uiverse component replacement and Studio connection recovery

Owner: replace as many UI elements as possible from Uiverse and work directly against main without creating branches or clones. Continue the already authorized public deployment.

- Eighteen pinned MIT source elements cover primary/secondary/icon/action buttons, input focus, composer border, sun/moon theme switch, segmented controls, content/gradient/depth cards, form shell, tooltips, workspace grid, dots, ring spinner and four-box loading. Source URLs, authors and hashes are in `apps/www/components/uiverse/sources.json`; license notices are preserved.
- Existing Cursor layout, actual backend calls, project history, drafts and OAuth/OTP handlers retained. No new dependencies.
- Connect Studio opens a dialog immediately while an empty workspace creates its project. Pending operations disable duplicate clicks. A failed request exposes retry. Replacing/closing a displayed unclaimed code calls the existing owner-scoped cancellation route. Codes show server-derived expiry and support copying. Closing returns keyboard focus to the trigger. Project queries and pairing requests are bounded to avoid indefinite waiting.
- 27/27 general browser checks passed across 390/768/1024/1440; 11/11 new connection/control regressions passed. TypeScript and source boundary/name guards passed. Fixtures are labeled; these checks do not prove a real Studio plugin claimed a code.
- Live diagnostic on the previously deployed revision: authentication returned 200 and all four signed-in screens rendered. Direct REST project reads timed out, while database management reported ACTIVE_HEALTHY and no query lock backlog. Public verification continues after deployment; a real plugin connection is not yet claimed.
