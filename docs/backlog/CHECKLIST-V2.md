# COMPLETE AI ROBLOX SAAS SHELL — 10/10 TARGET CHECKLIST

Owner-authored list of record. 60 sections, 1200 items. Marked 2026-09-15.

**✓ 77 done · ~ 144 partly built · ☐ 906 not found · ✗ 73 dropped by the owner**

`✓` a test in this repo asserts it, and the test is printed beside the line.
`~` code that implements it exists, but no test names it.
`☐` this script found neither. That is what the script saw — not proof the feature is absent.
`✗` the owner said no to this one.

## 01. PUBLIC WEBSITE AND PRODUCT DISCOVERY  —  0/20

- [☐] Clear product positioning
- [☐] Audience-specific landing pages
- [~] Product capability overview  · `apps/worker/src/collab.ts`
- [☐] Interactive product walkthrough
- [☐] Working sample projects
- [☐] Roblox Studio integration overview
- [☐] Supported workflow documentation
- [☐] Transparent capability limitations
- [~] Public pricing page  · `apps/site/src/pages/index.astro`
- [~] Plan comparison table  · `apps/web/src/lib/generative-ui/schema.ts`
- [☐] Usage and credit explanation
- [☐] Frequently asked questions
- [☐] Searchable documentation entry point
- [☐] Public changelog
- [☐] Public service status page
- [~] Security and privacy overview  · `apps/web/src/routes/settings.tsx`
- [☐] Contact and support options
- [☐] Accessible registration entry points
- [☐] Mobile-friendly public pages
- [☐] Accurate product screenshots and demonstrations

## 02. REGISTRATION AND SIGN-IN  —  0/20

- [☐] Email and password registration
- [~] Email verification  · `apps/web/src/lib/auth-flows.ts`
- [☐] Passwordless email sign-in
- [☐] Passkey registration and sign-in
- [☐] Supported social sign-in providers
- [☐] Enterprise single sign-on
- [✗] Organization-specific sign-in policies  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Invitation-based registration
- [☐] Expired invitation recovery
- [☐] Existing-account invitation acceptance
- [~] Duplicate-account detection  · `packages/corpus/src/intake/dedupe.mjs`
- [☐] Secure identity linking
- [☐] Identity unlinking with recovery safeguards
- [~] Password reset  · `apps/web/src/lib/auth-flows.ts`
- [☐] Expired reset-link recovery
- [~] Safe post-login redirects  · `apps/web/src/lib/safe-redirect.ts`
- [☐] Session restoration after page refresh
- [☐] Return to interrupted onboarding after login
- [~] Clear authentication failure messages  · `apps/web/src/lib/auth-flows.ts`
- [~] Sign-out from the current session  · `apps/plugin/src/init.server.luau`

## 03. ACCOUNT SECURITY AND RECOVERY  —  0/20

- [☐] Multifactor authentication enrollment
- [☐] Multifactor authentication verification
- [☐] Recovery code generation
- [☐] Recovery code regeneration
- [☐] Lost-authenticator recovery
- [☐] Passkey management
- [☐] Active session inventory
- [☐] Device and browser identification
- [☐] Individual session revocation
- [☐] Sign-out from all devices
- [☐] Suspicious sign-in notifications
- [☐] New-device notifications
- [☐] Sensitive-action reauthentication
- [☐] Secure email address changes
- [☐] Password change notifications
- [☐] Compromised credential handling
- [☐] Account recovery request tracking
- [☐] Security event history
- [✗] Organization-enforced security requirements  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Protection against account enumeration

## 04. USER PROFILE AND PERSONAL SETTINGS  —  0/20

- [~] Display name management  · `apps/web/src/lib/member-match.ts`
- [☐] Profile image management
- [☐] Verified email management
- [☐] Preferred language selection
- [☐] Timezone selection
- [☐] Date and time formatting preferences
- [☐] Number formatting preferences
- [☐] Light and dark appearance preferences
- [☐] System appearance synchronization
- [☐] Accessibility preference storage
- [~] Notification channel preferences  · `apps/worker/src/notifications.ts`
- [✗] Default organization selection  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Default workspace selection  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Default project landing view
- [☐] Keyboard shortcut preferences
- [☐] AI interaction preferences
- [☐] Connected identity overview
- [~] Personal settings search  · `apps/worker/src/memory-store.ts`
- [☐] Settings synchronization across devices
- [~] Settings reset with confirmation  · `apps/web/src/components/reauth-dialog.tsx`

## 05. ONBOARDING AND ACTIVATION  —  2/20

- [☐] First-use welcome flow
- [☐] Intended-use selection
- [☐] Individual or team setup
- [✗] Organization creation during onboarding  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace creation during onboarding  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] First project creation
- [☐] Sample project selection
- [☐] Roblox Studio prerequisite check
- [☐] Studio plugin installation guidance
- [☐] Studio pairing walkthrough
- [☐] Connection troubleshooting guidance
- [✓] First successful AI request  · `apps/web/tests/connectivity.test.mjs — "a request that never left, with nothing successful since, means unreachable"`
- [☐] First proposed Studio change
- [✓] First change approval  · `apps/worker/tests/collab-threads.test.mjs — "one changes_requested blocks, and a later approval from someone else does not erase it"`
- [☐] First verified Studio operation
- [☐] First undo demonstration
- [☐] Initial usage allowance explanation
- [☐] Onboarding progress persistence
- [☐] Skip and resume onboarding
- [☐] Contextual next-step guidance

## 06. ORGANIZATION MANAGEMENT  —  0/20

- [✗] Organization creation  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization profile editing  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization logo management  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization identifier management  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization switcher  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization ownership display  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization ownership transfer  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Sole-owner departure protection  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization billing contact  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization security settings  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization default member role  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization domain verification  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Domain-based membership policies  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization workspace inventory  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization usage overview  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization integration inventory  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization lifecycle status  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization export initiation  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization deletion preview  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Organization deletion recovery window  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`

## 07. MEMBERSHIP AND INVITATIONS  —  3/20

- [✓] Member directory  · `apps/worker/tests/collab-threads.test.mjs — "a directory row with an unreadable role is not a member, so it cannot be mentioned"`
- [☐] Member search and filtering
- [~] Single-member invitations  · `apps/worker/src/membership.ts`
- [~] Bulk invitations  · `apps/worker/src/membership.ts`
- [☐] Invitation role selection
- [✗] Invitation workspace assignment  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Invitation expiration
- [☐] Invitation resend
- [☐] Invitation revocation
- [☐] Pending invitation inventory
- [☐] Invitation acceptance audit
- [✓] Role change history  · `apps/worker/tests/membership-lifecycle.test.mjs — "the history records what CHANGED, including the role that was overwritten"`
- [☐] Member suspension
- [☐] Member reactivation
- [✓] Member removal impact preview  · `apps/worker/tests/membership-lifecycle.test.mjs — "the impact preview counts what the departing member actually holds, and writes nothing"`
- [~] Removed-member access revocation  · `apps/worker/src/run-access.ts`
- [☐] Departing-member resource reassignment
- [☐] Guest membership
- [☐] Temporary membership expiration
- [✗] Seat availability visibility  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`

## 08. AUTHORIZATION AND TENANT ISOLATION  —  1/20

- [☐] Explicit resource ownership
- [☐] Deny-by-default authorization
- [☐] Server-side permission enforcement
- [~] Database-level tenant isolation  · `infra/supabase/tests/rls-isolation.mjs`
- [✗] Organization-scoped data access  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace-scoped data access  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [~] Project-scoped data access  · `apps/web/src/lib/supabase.ts`
- [~] Action-level permissions  · `apps/worker/src/collab.ts`
- [☐] Built-in role definitions
- [☐] Custom role definitions
- [☐] Least-privilege default roles
- [~] Permission inheritance visibility  · `apps/worker/tests/effective-permissions.test.mjs`
- [✓] Permission override visibility  · `apps/worker/tests/effective-permissions.test.mjs — "OVERRIDE VISIBILITY: two grants, and the answer says which one won"`
- [~] Effective permission inspection  · `apps/worker/tests/effective-permissions.test.mjs`
- [☐] Cross-tenant access rejection
- [☐] Unauthorized resource existence protection
- [☐] Search result permission filtering
- [☐] Export permission enforcement
- [☐] Background job permission enforcement
- [☐] Automated multi-tenant isolation verification

## 09. WORKSPACE MANAGEMENT  —  0/20

- [✗] Workspace creation  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace naming and description  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace icon and color  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace membership  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace administrator assignment  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace visibility controls  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace switcher  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace project directory  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace-level defaults  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace-specific integrations  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace-specific AI policies  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace usage allocation  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace spending allocation  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace activity history  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace resource transfer  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace duplication  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace archival  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace restoration  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace export  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace deletion impact preview  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`

## 10. PROJECT MANAGEMENT  —  4/20

- [☐] Project creation from an empty workspace
- [☐] Project creation from a template
- [☐] Project creation from an existing Studio place
- [~] Project naming and description  · `apps/worker/src/automations.ts`
- [☐] Project icon and cover image
- [☐] Project status
- [✓] Project ownership  · `apps/worker/tests/memory-personalisation.test.mjs — "project scope is proven by an ownership query, not by the id in the URL"`
- [~] Project membership  · `apps/worker/src/collab.ts`
- [☐] Project permission settings
- [~] Project tags  · `apps/worker/src/preferences.ts`
- [~] Project folders  · `apps/web/src/components/ws/files-model.ts`
- [☐] Project favorites
- [☐] Project duplication
- [✗] Project transfer between workspaces  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✓] Project archive and restore  · `apps/web/tests/archive.test.mjs — "the menu offers Restore on an archived project, not Archive again"`
- [✓] Project export  · `apps/worker/tests/export.test.mjs — "the export route refuses a project the caller does not own"`
- [☐] Project deletion recovery
- [☐] Project connection inventory
- [☐] Project resource inventory
- [✓] Project activity timeline  · `apps/web/tests/activity-motion.test.mjs — "every animation on the activity timeline is gated behind .gx-act.is-moving"`

## 11. APPLICATION SHELL AND NAVIGATION  —  0/20

- [☐] Persistent application navigation
- [✗] Organization and workspace context display  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Project context display
- [☐] Breadcrumb navigation
- [☐] Stable deep links
- [~] Browser back and forward support  · `apps/worker/tests/companion-route.test.mjs`
- [☐] Restorable panel layouts
- [☐] Resizable panels
- [☐] Collapsible navigation
- [☐] Tabbed project views
- [☐] Recently opened resources
- [☐] Favorite resource shortcuts
- [~] Global command palette  · `apps/web/src/components/shortcuts-dialog.tsx`
- [☐] Contextual action menus
- [☐] Unsaved-change navigation protection
- [☐] Permission-aware navigation
- [~] Not-found pages  · `apps/web/src/routes/not-found.tsx`
- [☐] Access-denied pages
- [☐] Recoverable application error boundaries
- [☐] Consistent account and settings access

## 12. SEARCH AND RESOURCE DISCOVERY  —  5/20

- [☐] Global resource search
- [✗] Organization-scoped search  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✗] Workspace-scoped search  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [✓] Project-scoped search  · `apps/web/tests/search-panel.test.mjs — "the client route is the project-scoped search endpoint, with the filters attached"`
- [☐] Conversation search
- [☐] Message content search
- [☐] File and artifact search
- [✓] Asset search  · `apps/web/tests/evidence-model.test.mjs — "an asset search shows what it matched, thumbnail or not"`
- [☐] Member search
- [☐] Activity search
- [✓] Search result type filters  · `apps/worker/tests/search.test.mjs — "with no filter given, every type and every author is searched"`
- [✓] Search date filters  · `apps/web/tests/search-panel.test.mjs — "the kind and date filters are pressed-state controls, not colour alone"`
- [☐] Search ownership filters
- [☐] Search tag filters
- [~] Search result relevance ranking  · `apps/web/src/lib/member-match.ts`
- [☐] Search result previews
- [✓] Search query history  · `apps/web/tests/search-history.test.mjs — "storage that throws on write costs the history, not the search"`
- [☐] Saved search views
- [☐] Keyboard-driven result navigation
- [☐] Clear empty and unavailable search states

## 13. ROBLOX STUDIO INSTALLATION AND PAIRING  —  1/20

- [☐] Verified plugin installation entry point
- [☐] Supported Studio version guidance
- [☐] Plugin version display
- [☐] Plugin update availability
- [☐] Plugin compatibility validation
- [☐] Secure pairing code generation
- [~] Short-lived pairing codes  · `apps/web/src/components/pairing-dialog.tsx`
- [✓] Single-use pairing codes  · `apps/web/tests/presence-model.test.mjs — "initials are code points, not charAt — a surrogate pair is never cut in half"`
- [☐] Pairing confirmation in the web application
- [☐] Pairing confirmation inside Studio
- [✗] Explicit organization selection during pairing  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Explicit project selection during pairing
- [☐] Place identity confirmation
- [~] Duplicate pairing detection  · `packages/corpus/src/intake/dedupe.mjs`
- [☐] Pairing expiration recovery
- [☐] Pairing cancellation
- [☐] Paired installation inventory
- [☐] Installation rename
- [☐] Installation revocation
- [☐] Plugin removal and disconnect guidance

## 14. STUDIO CONNECTION AND SESSION MANAGEMENT  —  2/20

- [~] Live connection status  · `packages/sdk/src/errors.mjs`
- [☐] Last successful heartbeat
- [☐] Connection latency display
- [☐] Active place identification
- [☐] Active Studio session identification
- [☐] Multiple Studio session inventory
- [☐] Explicit active-session selection
- [✓] Project-to-place binding  · `apps/worker/tests/studio-place-poll.test.mjs — "an unbound project BINDS on the first identifiable place and is served"`
- [☐] Connection authorization refresh
- [☐] Automatic reconnection
- [☐] Reconnection progress display
- [☐] Offline operation queue visibility
- [☐] Queue cancellation before reconnect
- [☐] Session expiration handling
- [☐] Stale session detection
- [☐] Duplicate command protection
- [☐] Plugin and server protocol negotiation
- [✓] Connection diagnostics  · `apps/worker/tests/studio-link-routes-live.test.mjs — "the owner can read connection diagnostics WITHOUT the admin key"`
- [☐] Safe disconnect behavior
- [☐] Reconnection reconciliation of pending operations

## 15. STUDIO OPERATION EXECUTION  —  0/20

- [☐] Studio capability discovery
- [☐] Supported operation registry
- [☐] Operation argument validation
- [☐] Target instance validation
- [☐] Stable instance identity mapping
- [~] Target place validation  · `apps/worker/tests/prefabs.test.mjs`
- [☐] Pre-operation state capture
- [☐] Dry-run operation preview
- [☐] Batched operation execution
- [☐] Per-operation execution results
- [☐] Partial batch failure reporting
- [☐] Operation timeout handling
- [☐] Operation cancellation
- [☐] Retry eligibility classification
- [☐] Safe retry execution
- [☐] Conflict detection against current Studio state
- [☐] Destructive operation confirmation
- [☐] Studio undo integration
- [☐] Operation provenance tracking
- [☐] Verification of resulting Studio state

## 16. CONVERSATION MANAGEMENT  —  2/20

- [☐] New conversation creation
- [☐] Project-bound conversations
- [☐] Conversation naming
- [☐] Automatic title suggestions
- [☐] Conversation rename
- [☐] Conversation folders
- [☐] Conversation tags
- [☐] Conversation pinning
- [☐] Conversation favorites
- [☐] Conversation archival
- [☐] Conversation restoration
- [☐] Conversation deletion confirmation
- [☐] Conversation export
- [☐] Conversation duplication
- [~] Conversation branching  · `apps/web/tests/image-expiry.test.mjs`
- [☐] Branch ancestry display
- [✓] Message editing  · `apps/worker/tests/edit-resend.test.mjs — "the cut is by time, from the edited message inclusive"`
- [✓] Message version history  · `apps/worker/tests/collab-version-history.test.mjs — "a version that is not in the history cannot be restored"`
- [☐] Response regeneration
- [☐] Conversation state restoration across devices

## 17. MESSAGE COMPOSER AND ATTACHMENTS  —  1/20

- [☐] Multiline message input
- [☐] Configurable send shortcut
- [☐] Draft persistence
- [☐] Draft recovery after refresh
- [☐] File attachment upload
- [☐] Image attachment upload
- [☐] Audio attachment upload
- [~] Pasted image handling  · `apps/web/tests/image-expiry.test.mjs`
- [☐] Drag-and-drop attachments
- [☐] Attachment upload progress
- [☐] Attachment upload cancellation
- [☐] Attachment retry
- [☐] Attachment size validation
- [☐] Attachment type validation
- [☐] Attachment removal before sending
- [☐] Project resource mentions
- [✓] Studio object references  · `packages/corpus/src/intake/forks.test.mjs — "repository references parse from a slug, a URL or an object — and garbage throws"`
- [☐] Prompt template insertion
- [☐] Message length feedback
- [☐] Clear submission failure recovery

## 18. AI RESPONSE PRESENTATION  —  2/20

- [☐] Incremental response streaming
- [~] Markdown rendering  · `apps/web/src/lib/markdown.tsx`
- [~] Syntax-highlighted code blocks  · `apps/web/src/components/ws/code-block.tsx`
- [~] Copyable code blocks  · `apps/web/src/components/ws/code-block.tsx`
- [☐] Structured tables
- [☐] Expandable long responses
- [✓] Source citation links  · `apps/worker/tests/retrieval.test.mjs — "a markdown link is not a citation, and there is no source zero"`
- [☐] Citation source previews
- [☐] Tool activity summaries
- [☐] Run progress indicators
- [✓] Proposed change summaries  · `apps/worker/tests/memory.test.mjs — "the proposed summary is decided separately from the facts"`
- [~] File and artifact cards  · `apps/web/src/components/ws/evidence-model.ts`
- [☐] Scene preview cards
- [☐] Verification result cards
- [☐] Explicit incomplete response states
- [☐] Explicit failed response states
- [☐] Accessible streaming announcements
- [☐] Scroll position preservation
- [☐] User-controlled follow-to-latest behavior
- [☐] Separation of generated claims from verified results

## 19. MODEL SELECTION AND PROVIDER CONTROL  —  0/20

- [☐] Available model catalog
- [~] Model capability descriptions  · `apps/worker/src/audio-tools.ts`
- [~] Model context limits  · `apps/worker/src/assets.ts`
- [☐] Supported input modality display
- [☐] Supported output modality display
- [☐] Estimated model cost display
- [~] Default model selection  · `apps/web/src/lib/selection-reference.ts`
- [~] Per-conversation model selection  · `apps/web/src/lib/selection-reference.ts`
- [☐] Per-run model override
- [✗] Organization-approved model policies  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Provider availability indicators
- [☐] Model retirement notices
- [☐] Fallback model configuration
- [☐] Fallback transparency
- [☐] Provider timeout handling
- [☐] Provider rate-limit handling
- [☐] Provider outage handling
- [☐] Provider-specific error normalization
- [☐] Actual model attribution per response
- [✗] Organization controls for externally processed data  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`

## 20. CONTEXT AND KNOWLEDGE RETRIEVAL  —  0/20

- [☐] Current project context assembly
- [☐] Selected Studio object context
- [~] Script context selection  · `apps/web/src/lib/mock.ts`
- [☐] Project file context selection
- [☐] Conversation context selection
- [☐] Documentation source ingestion
- [☐] Repository source ingestion
- [☐] Manual knowledge uploads
- [~] Source access validation  · `apps/worker/src/asset-library.ts`
- [☐] Source freshness indicators
- [☐] Source reindexing controls
- [☐] Context budget visibility
- [☐] Context truncation disclosure
- [☐] Source inclusion controls
- [~] Source exclusion controls  · `apps/worker/src/semantic.ts`
- [☐] Retrieval result attribution
- [☐] Conflicting source identification
- [☐] Permission-aware retrieval
- [☐] Deleted-source removal from retrieval
- [☐] Retrieval failure and fallback visibility

## 21. MEMORY AND PERSONALIZATION  —  3/20

- [✓] User memory scope  · `apps/worker/tests/memory-personalisation.test.mjs — "every scoped-memory route proves the scope before it touches a row"`
- [✓] Project memory scope  · `apps/worker/tests/memory-personalisation.test.mjs — "every scoped-memory route proves the scope before it touches a row"`
- [☐] Organization memory scope
- [☐] Explicit memory creation
- [☐] Suggested memory approval
- [✓] Memory source attribution  · `packages/corpus/src/intake/licence.test.mjs — "attributionText renders the credit an ATTRIBUTION_REQUIRED source needs, pinned to a commi"`
- [☐] Memory creation timestamp
- [☐] Memory modification history
- [~] Memory viewer  · `infra/supabase/migrations/0006_membership_lifecycle.sql`
- [☐] Memory search
- [☐] Memory editing
- [☐] Memory deletion
- [☐] Memory expiration
- [~] Memory scope changes  · `apps/worker/src/memory-store.ts`
- [☐] Memory access controls
- [☐] Sensitive memory handling
- [☐] Conflicting memory resolution
- [☐] Memory export
- [~] Memory import validation  · `packages/evals/src/tasks.mjs`
- [☐] Disable-memory mode

## 22. AGENT PLANNING  —  3/20

- [☐] Goal capture
- [☐] Goal editing before execution
- [☐] Clarifying question support
- [☐] Explicit assumption display
- [☐] Proposed execution plan
- [~] Plan step descriptions  · `apps/worker/src/assets.ts`
- [✓] Plan dependencies  · `apps/web/tests/roadmap-model.test.mjs — "a dependency cycle is reported and the plan still lays out"`
- [☐] Required tool identification
- [☐] Required capability checks
- [☐] Required permission checks
- [✓] Estimated usage  · `apps/worker/tests/usage-extraction.test.mjs — "CONTROL: a well-formed usage block is passed through EXACTLY, not estimated"`
- [☐] Estimated cost range
- [☐] Estimated execution duration
- [☐] Expected output definition
- [~] Verification step planning  · `apps/web/src/components/ws/thinking-model.ts`
- [~] Plan approval  · `apps/worker/src/collab-threads.ts`
- [☐] Plan revision
- [✓] Plan version history  · `apps/worker/tests/collab-version-history.test.mjs — "a version that is not in the history cannot be restored"`
- [☐] Scope change visibility
- [☐] Plan-to-execution traceability

## 23. AGENT RUN LIFECYCLE  —  1/20

- [☐] Queued run state
- [☐] Preparing run state
- [☐] Running run state
- [☐] Waiting-for-user run state
- [☐] Waiting-for-tool run state
- [~] Paused run state  · `infra/supabase/migrations/0006_membership_lifecycle.sql`
- [☐] Completed run state
- [✓] Failed run state  · `apps/web/tests/playtest-viewport.test.mjs — "the state chip is bound to frame freshness, not to the run phase"`
- [~] Cancelled run state  · `apps/web/src/lib/billing-copy.ts`
- [☐] Run progress persistence
- [☐] Run recovery after browser refresh
- [☐] Run recovery after connection loss
- [☐] Run cancellation acknowledgement
- [☐] Run timeout enforcement
- [~] Step-level checkpoints  · `apps/web/src/lib/generative-ui/schema.ts`
- [☐] Safe continuation from checkpoints
- [☐] Partial result preservation
- [☐] Terminal state immutability
- [☐] Concurrent run conflict handling
- [~] Per-run execution history  · `apps/worker/src/automation-store.ts`

## 24. APPROVALS AND TOOL PERMISSIONS  —  1/20

- [~] Read-only tool permissions  · `apps/worker/src/preferences.ts`
- [✓] Write tool permissions  · `apps/worker/tests/memory-personalisation.test.mjs — "tool permissions NARROW the mode toolset, they do not replace it"`
- [☐] Destructive action permissions
- [☐] External network permissions
- [☐] Project-specific tool policies
- [✗] Organization-specific tool policies  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [~] Per-run permission grants  · `apps/worker/src/collab.ts`
- [☐] Temporary permission expiration
- [☐] Approval request summaries
- [☐] Exact target resource display
- [☐] Proposed change previews
- [☐] Estimated charge disclosure
- [☐] Approval acceptance
- [☐] Approval rejection
- [☐] Approval expiration
- [☐] Approval revocation before execution
- [☐] Approval audit history
- [☐] Changed-plan reapproval requirements
- [☐] Protection against approval reuse
- [☐] Safe behavior when approval is unavailable

## 25. LUAU CODE WORKFLOW  —  1/20

- [☐] Script discovery
- [~] Script content inspection  · `apps/worker/src/assets.ts`
- [☐] Script creation
- [✓] Script editing  · `apps/worker/tests/luau-review.test.mjs — "edit_script REFUSES a body that does not parse, and no write reaches Studio"`
- [☐] Syntax validation
- [☐] Code formatting
- [~] Static analysis  · `packages/corpus/src/intake/security.mjs`
- [☐] Type diagnostics
- [☐] Symbol navigation
- [☐] Definition lookup
- [☐] Reference lookup
- [☐] Dependency inspection
- [☐] Server and client context identification
- [☐] Remote event misuse detection
- [☐] Infinite loop risk detection
- [~] Code diff preview  · `apps/web/src/components/ws/files-model.ts`
- [☐] Selective change application
- [☐] Concurrent edit conflict detection
- [☐] Script test result display
- [~] Verified script rollback  · `scripts/lib/rollback-rules.mjs`

## 26. ROBLOX SCENE BUILDING  —  1/20

- [☐] Explorer hierarchy inspection
- [~] Instance property inspection  · `packages/corpus/src/intake/contenthash.test.mjs`
- [☐] Selected object synchronization
- [☐] Primitive creation
- [☐] Model assembly
- [☐] Grouped object transforms
- [☐] Object duplication
- [~] Object renaming  · `apps/web/src/lib/rename-project.ts`
- [☐] Object parenting
- [☐] Object grouping and ungrouping
- [☐] Property editing
- [☐] Material and color editing
- [✓] Lighting configuration  · `packages/evals/src/asset-qc.test.mjs — "ASSET_KINDS is the storable subset — lighting is configuration, not an asset"`
- [☐] Collision configuration
- [☐] Constraint configuration
- [☐] Spawn point placement
- [☐] Interaction object configuration
- [☐] Supported UI instance generation
- [☐] Scene validation after modification
- [☐] Scene changes linked to originating runs

## 27. ASSET SEARCH AND GENERATION  —  4/20

- [☐] Asset library browsing
- [~] Asset keyword search  · `apps/worker/src/rag.ts`
- [✓] Asset type filtering  · `apps/worker/tests/search.test.mjs — "with no filter given, every type and every author is searched"`
- [☐] Asset source filtering
- [☐] Asset metadata inspection
- [✓] Asset creator attribution  · `packages/evals/src/provenance.test.mjs — "AN ATTRIBUTION-REQUIRED ASSET publishes commercially but carries a warning and a credit li"`
- [☐] Asset licensing metadata
- [☐] Asset provenance history
- [☐] Asset suitability warnings
- [~] Asset generation requests  · `apps/plugin/src/Generation.luau`
- [☐] Asset generation progress
- [☐] Asset generation cancellation
- [☐] Durable generated asset storage
- [~] Generated asset previews  · `apps/site/src/layouts/Base.astro`
- [✓] Asset version history  · `apps/worker/tests/collab-version-history.test.mjs — "a version that is not in the history cannot be restored"`
- [☐] Asset insertion preview
- [☐] Asset import capability checks
- [☐] Scoped asset upload authorization
- [✓] Supported Roblox asset export  · `apps/worker/tests/meshgen.test.mjs — "the exported GLB passes the asset judge on everything except the texture it honestly lacks"`
- [☐] Clear unavailable asset operation states

## 28. SCENE PREVIEWS AND EVIDENCE  —  0/20

- [☐] Software-rendered scene previews
- [☐] Preview source identification
- [☐] Preview generation timestamps
- [☐] Preview freshness indicators
- [☐] Preview-to-run association
- [☐] Preview-to-project association
- [☐] Preview-to-scene-version association
- [☐] Preview resolution metadata
- [☐] Camera framing controls
- [☐] Selected object focus
- [☐] Before-and-after preview comparison
- [~] User-uploaded Studio screenshots  · `apps/web/src/components/ws/studio-view.tsx`
- [☐] Supported capture capability detection
- [~] Capture permission status  · `apps/worker/src/build-audit.ts`
- [☐] Missing visual evidence indicators
- [☐] Preview delivery failure recovery
- [☐] Preview payload validation
- [☐] Evidence attachment to verification results
- [☐] Evidence retention controls
- [☐] Explicit distinction between previews and captured Studio output

## 29. PLAYTESTING AND VERIFICATION  —  2/20

- [☐] Studio playtest capability detection
- [✓] Playtest start controls  · `apps/worker/tests/playtest-stream.test.mjs — "a new playtest starts in preparing, with nothing claimed"`
- [✓] Playtest stop controls  · `apps/worker/tests/frame-bus.test.mjs — "the budget is a hard stop, however long the playtest runs"`
- [☐] Playtest session identification
- [☐] Test scenario selection
- [☐] Test preparation status
- [☐] Runtime error collection
- [☐] Runtime warning collection
- [☐] Test assertion results
- [☐] Build integrity checks
- [☐] Required object existence checks
- [~] Expected property value checks  · `scripts/gate-check.mjs`
- [☐] Script execution verification
- [☐] Interaction behavior verification
- [~] Test duration limits  · `apps/worker/src/audio.ts`
- [☐] Interrupted test handling
- [☐] Failed test investigation links
- [☐] Verification evidence attachments
- [~] Verification summary per run  · `apps/plugin/tests/run.mjs`
- [☐] Explicit unverified result states

## 30. HISTORY, DIFFS, AND RECOVERY  —  0/20

- [☐] Project change timeline
- [☐] Studio operation timeline
- [☐] Script revision history
- [~] Scene snapshot history  · `apps/worker/src/version-history.ts`
- [☐] Asset revision history
- [☐] Named checkpoints
- [~] Automatic pre-change checkpoints  · `apps/worker/tests/op-attribution.test.mjs`
- [☐] Snapshot descriptions
- [☐] Author attribution
- [~] Run attribution  · `apps/worker/src/op-attribution.ts`
- [☐] Script revision comparison
- [☐] Scene structure comparison
- [~] Property-level change comparison  · `apps/web/src/lib/generative-ui/schema.ts`
- [☐] Selective change reversal
- [☐] Full checkpoint restoration
- [☐] Restoration impact preview
- [☐] Restore conflict detection
- [☐] Restore progress display
- [☐] Restore result verification
- [☐] Recovery from interrupted restoration

## 31. COLLABORATION AND REVIEW  —  5/20

- [✓] Shared project access  · `apps/worker/tests/collab-routes.test.mjs — "A STRANGER is refused on every shared route, and never learns the project exists"`
- [☐] Shared conversation access
- [☐] Shared artifact access
- [~] Resource-specific share links  · `apps/worker/src/collab-links.ts`
- [☐] Share link expiration
- [☐] Share link revocation
- [☐] Member presence indicators
- [☐] Active editor indicators
- [☐] Inline comments
- [✓] Threaded replies  · `apps/worker/tests/collab-threads.test.mjs — "a reply to a comment that is gone is refused, not promoted to a new thread"`
- [✓] Member mentions  · `apps/worker/tests/collab-threads.test.mjs — "a mention of a NON-MEMBER notifies nobody"`
- [☐] Comment resolution
- [☐] Comment reopening
- [✓] Review requests  · `apps/worker/tests/collab-threads.test.mjs — "a commenter cannot open a review request; an editor can"`
- [☐] Reviewer assignment
- [✓] Proposed change review  · `apps/worker/tests/memory.test.mjs — "under review a distilled fact is proposed and active memory is untouched"`
- [~] Approval and rejection records  · `apps/worker/src/collab-threads.ts`
- [☐] Concurrent collaboration conflict handling
- [☐] Permission changes applied to active sessions
- [☐] Collaborative activity history

## 32. FILES, ARTIFACTS, AND EXPORTS  —  5/20

- [☐] Project file browser
- [☐] Folder creation and management
- [✓] File upload  · `tests/deploy-content-type.test.mjs — "THE DEFECT: an html file uploaded to an EXTENSIONLESS key still gets text/html"`
- [☐] Multipart upload recovery
- [✓] File rename  · `apps/worker/tests/files-routes-live.test.mjs — "a member who may build can rename, and the file moves"`
- [✓] File move  · `apps/worker/tests/files-routes-live.test.mjs — "a member who may build can rename, and the file moves"`
- [☐] File duplication
- [✓] File version history  · `apps/worker/tests/collab-version-history.test.mjs — "a version that is not in the history cannot be restored"`
- [~] File previews  · `apps/web/src/components/ws/files-model.ts`
- [✓] File download  · `apps/worker/tests/files-routes-live.test.mjs — "a download is an attachment, and a .js file is still served as text"`
- [☐] Bulk file download
- [☐] Generated artifact persistence
- [☐] Artifact metadata
- [☐] Artifact provenance
- [☐] Artifact access permissions
- [☐] Expiring download links
- [☐] Storage usage visibility
- [☐] File deletion recovery
- [☐] Export progress tracking
- [☐] Export integrity verification

## 33. AUTOMATIONS AND BACKGROUND TASKS  —  2/20

- [☐] Automation creation
- [~] Automation naming and descriptions  · `apps/worker/src/automations.ts`
- [☐] Manual automation execution
- [☐] Scheduled automation execution
- [☐] Event-triggered automation execution
- [☐] Timezone-aware scheduling
- [☐] Daylight-saving behavior visibility
- [☐] Automation permission scope
- [☐] Automation budget limits
- [~] Automation execution history  · `apps/worker/src/automation-store.ts`
- [☐] Automation pause and resume
- [☐] Automation cancellation
- [☐] Missed-run handling
- [✓] Overlapping-run policy  · `apps/worker/tests/automations.test.mjs — "an overlapping fire is queued or dropped according to the automation own policy"`
- [☐] Retry policy configuration
- [☐] Duplicate-trigger protection
- [✓] Failed-run notifications  · `apps/worker/tests/notifications.test.mjs — "two different runs failing are two notifications, not one line reading 2"`
- [☐] Approval-dependent automation steps
- [~] Automation ownership transfer  · `apps/worker/src/automation-store.ts`
- [☐] Automation disablement after access revocation

## 34. NOTIFICATIONS AND ACTIVITY INBOX  —  6/20

- [✓] In-app notification inbox  · `apps/worker/tests/notifications.test.mjs — "a well-formed event becomes a notification carrying everything the inbox renders"`
- [~] Email notifications  · `apps/worker/tests/notifications.test.mjs`
- [☐] Optional browser push notifications
- [✓] Notification delivery preferences  · `apps/worker/tests/notification-preferences.test.mjs — "a delivery preference survives the trip out to rows and back"`
- [✓] Per-project notification preferences  · `apps/worker/tests/notification-preferences.test.mjs — "the two notification keys are preferences, so they inherit scoping rather than reinventing"`
- [✓] Per-event notification preferences  · `apps/worker/tests/notification-preferences.test.mjs — "the two notification keys are preferences, so they inherit scoping rather than reinventing"`
- [☐] Run completion notifications
- [✓] Run failure notifications  · `apps/worker/tests/notifications.test.mjs — "two different runs failing are two notifications, not one line reading 2"`
- [☐] Approval request notifications
- [☐] Collaboration mention notifications
- [☐] Billing issue notifications
- [~] Usage threshold notifications  · `apps/worker/src/notifications.ts`
- [~] Security event notifications  · `apps/worker/src/automation-store.ts`
- [☐] Integration failure notifications
- [~] Unread notification count  · `apps/worker/src/notification-store.ts`
- [✓] Mark-as-read controls  · `apps/worker/tests/notification-store.test.mjs — "marking another person row read changes nothing, and says so"`
- [~] Notification grouping  · `apps/worker/src/notification-store.ts`
- [☐] Duplicate notification suppression
- [☐] Deep links to relevant resources
- [☐] Quiet hours and digest scheduling

## 35. PLANS AND ENTITLEMENTS  —  0/20

- [☐] Defined subscription plan catalog
- [~] Free plan entitlements  · `apps/worker/src/billing.ts`
- [~] Paid plan entitlements  · `apps/worker/src/billing.ts`
- [☐] Team plan entitlements
- [☐] Enterprise entitlement overrides
- [~] Feature-to-plan mapping  · `packages/shared/src/index.ts`
- [☐] Server-enforced feature access
- [☐] Client-visible entitlement state
- [✗] Seat limits  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Project limits
- [☐] Storage limits
- [☐] Concurrent run limits
- [☐] Model access limits
- [☐] Integration limits
- [☐] Support level entitlements
- [☐] Trial entitlements
- [☐] Trial expiration handling
- [☐] Entitlement change propagation
- [☐] Existing-resource behavior after downgrade
- [☐] Clear upgrade prompts at actual limits

## 36. USAGE, QUOTAS, AND CREDITS  —  1/20

- [~] Per-request usage metering  · `apps/web/src/components/usage-meter-model.ts`
- [✓] Per-run usage metering  · `packages/evals/src/security.test.mjs — "A6 STATIC CHECK — the direct env.AI.run call sites are the known, metered ones"`
- [~] Per-user usage breakdown  · `apps/worker/src/analytics.ts`
- [~] Per-project usage breakdown  · `apps/worker/src/analytics.ts`
- [✗] Per-organization usage breakdown  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Input and output token accounting
- [☐] Non-token tool usage accounting
- [☐] Estimated usage before execution
- [☐] Actual usage after execution
- [☐] Credit balance display
- [☐] Append-only credit transaction ledger
- [☐] Credit reservation before execution
- [☐] Reservation settlement after execution
- [☐] Unused reservation release
- [☐] Concurrent request spending protection
- [☐] Included allowance reset rules
- [☐] Purchased credit expiration disclosure
- [☐] Failed-request charging rules
- [☐] Metering reconciliation
- [☐] Usage and credit transaction export

## 37. SUBSCRIPTION LIFECYCLE  —  0/20

- [☐] Subscription creation
- [☐] Subscription status display
- [☐] Trial start
- [☐] Trial conversion
- [☐] Trial expiration reminders
- [☐] Plan upgrade preview
- [☐] Immediate upgrade handling
- [☐] Scheduled downgrade handling
- [☐] Proration preview
- [✗] Seat count changes  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Billing cycle changes
- [☐] Cancellation at period end
- [☐] Cancellation confirmation
- [☐] Cancellation reversal before expiration
- [☐] Subscription pause where supported
- [☐] Subscription resumption where supported
- [☐] Renewal reminders
- [☐] Past-due grace period handling
- [☐] Subscription reactivation
- [☐] Historical subscription change records

## 38. CHECKOUT AND PAYMENT METHODS  —  0/20

- [☐] Plan-specific checkout
- [☐] Server-validated checkout pricing
- [☐] Currency display before payment
- [☐] Applicable tax display
- [☐] Discount code validation
- [☐] Order summary
- [☐] Payment provider hosted payment entry
- [☐] Strong customer authentication handling
- [☐] Checkout expiration handling
- [☐] Checkout cancellation recovery
- [☐] Successful payment confirmation
- [☐] Pending payment status
- [☐] Failed payment recovery
- [☐] Duplicate checkout protection
- [☐] Payment webhook signature verification
- [☐] Payment webhook replay protection
- [☐] Stored payment method management
- [☐] Default payment method selection
- [☐] Expiring payment method notifications
- [☐] Secure customer billing portal access

## 39. INVOICES AND BILLING RECORDS  —  0/20

- [☐] Invoice list
- [☐] Invoice detail view
- [☐] Invoice PDF download
- [☐] Invoice payment status
- [☐] Billing recipient management
- [☐] Billing address management
- [☐] Business name management
- [☐] Tax identification fields
- [☐] Purchase order reference support
- [☐] Invoice delivery preferences
- [☐] Receipt delivery
- [~] Credit note records  · `apps/worker/src/asset-library.ts`
- [☐] Refund request tracking
- [☐] Refund status visibility
- [☐] Billing adjustment history
- [✗] Seat charge breakdown  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [~] Usage charge breakdown  · `apps/worker/src/analytics.ts`
- [☐] Billing period comparison
- [☐] Billing record export
- [☐] Payment provider reconciliation reports

## 40. LOCALIZATION AND RIGHT-TO-LEFT SUPPORT  —  0/20

- [☐] Centralized translation catalog
- [☐] Stable translation keys
- [☐] Complete English interface
- [~] Complete Hebrew interface  · `apps/web/src/lib/direction.ts`
- [☐] Supported locale selection
- [☐] Locale fallback rules
- [☐] Browser language detection
- [☐] User language override
- [✗] Organization default language  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Full right-to-left layout support
- [☐] Bidirectional text handling
- [☐] Left-to-right code presentation
- [☐] Locale-aware date formatting
- [☐] Locale-aware number formatting
- [☐] Locale-aware currency formatting
- [☐] Timezone-aware timestamps
- [☐] Translated transactional emails
- [☐] Translated validation messages
- [~] Translation completeness checks  · `apps/worker/src/public-api.ts`
- [☐] Long-text and mixed-language layout testing

## 41. ACCESSIBILITY  —  2/20

- [☐] Keyboard access to every primary workflow
- [✓] Visible keyboard focus  · `tests/e2e/landing.spec.ts — "is keyboard reachable and keeps a visible focus ring"`
- [☐] Logical focus order
- [☐] Skip navigation links
- [~] Accessible page landmarks  · `scripts/check-site-semantics.mjs`
- [~] Correct semantic headings  · `scripts/check-site-semantics.mjs`
- [☐] Form field labels
- [☐] Accessible validation feedback
- [~] Screen-reader status announcements  · `apps/web/src/lib/announce.ts`
- [☐] Accessible dialogs
- [☐] Accessible menus
- [☐] Accessible tab controls
- [☐] Accessible tables
- [~] Accessible code presentation  · `apps/web/tests/code-presentation.test.mjs`
- [☐] Non-color status indicators
- [☐] Text contrast validation
- [✓] Reduced motion support  · `apps/web/tests/activity-model.test.mjs — "reduced motion removes travel and keeps feedback"`
- [☐] Browser zoom compatibility
- [☐] Touch target sizing
- [☐] Manual assistive technology verification

## 42. RESPONSIVE INTERACTION AND UI STATES  —  0/20

- [☐] Desktop workspace layout
- [☐] Laptop workspace layout
- [☐] Tablet workspace layout
- [~] Mobile project overview  · `apps/web/src/lib/shell.tsx`
- [☐] Mobile conversation access
- [☐] Mobile approval workflows
- [☐] Responsive settings pages
- [☐] Responsive billing pages
- [☐] Touch-friendly controls
- [☐] Loading states for asynchronous actions
- [☐] Skeleton states for content loading
- [☐] Empty states with relevant next actions
- [☐] Partial data states
- [☐] Offline states
- [~] Reconnecting states  · `apps/web/src/lib/use-project-socket.ts`
- [~] Expired session states  · `apps/worker/src/audio-store.ts`
- [☐] Permission loss states
- [☐] Retryable error states
- [☐] Non-retryable error states
- [☐] Success confirmation for consequential actions

## 43. DESIGN SYSTEM AND INTERFACE CONSISTENCY  —  0/20

- [☐] Shared color tokens
- [~] Shared typography tokens  · `packages/design/src/tokens.mjs`
- [☐] Shared spacing tokens
- [☐] Shared elevation tokens
- [~] Shared motion tokens  · `apps/web/src/components/ws/activity-model.ts`
- [☐] Standard icon library
- [☐] Standard button variants
- [☐] Standard input components
- [☐] Standard form layouts
- [☐] Standard table components
- [☐] Standard status badges
- [☐] Standard dialogs and drawers
- [☐] Standard tooltips and popovers
- [☐] Standard notification components
- [☐] Standard empty-state components
- [☐] Standard error presentation
- [☐] Shared terminology glossary
- [☐] Consistent action naming
- [☐] Theme consistency across all surfaces
- [☐] Visual regression coverage for shared components

## 44. PUBLIC API  —  1/20

- [☐] Documented API resource model
- [✗] Organization-scoped API credentials  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [~] Project-scoped API credentials  · `apps/worker/src/api-keys.ts`
- [~] Scoped API permissions  · `apps/web/src/lib/api.ts`
- [☐] API credential expiration
- [~] API credential rotation  · `apps/worker/src/api-keys.ts`
- [☐] API credential revocation
- [~] Versioned endpoints  · `apps/worker/src/webtools.ts`
- [☐] Consistent error responses
- [☐] Pagination
- [☐] Filtering
- [☐] Stable sorting
- [☐] Request validation
- [☐] Idempotency support
- [✓] Rate-limit headers  · `apps/worker/tests/public-api.test.mjs — "a live key returns an OpenAI-shaped completion with usage and rate-limit headers"`
- [☐] Usage response metadata
- [☐] Request correlation identifiers
- [~] Streaming response support  · `apps/worker/src/public-api.ts`
- [☐] Backward compatibility policy
- [☐] API deprecation notices

## 45. WEBHOOKS AND EVENT DELIVERY  —  3/20

- [☐] Webhook endpoint registration
- [☐] Webhook endpoint verification
- [✓] Event type selection  · `apps/worker/tests/companion-selection.test.mjs — "a log or state event is not a selection event"`
- [✗] Organization-scoped event subscriptions  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Project-scoped event subscriptions
- [✓] Versioned event schemas  · `apps/web/tests/generative-ui.test.mjs — "the schema version is enforced"`
- [~] Signed webhook payloads  · `apps/worker/tests/billing.test.mjs`
- [☐] Signing secret rotation
- [☐] Delivery attempt history
- [☐] Delivery response inspection
- [☐] Configurable retry behavior
- [~] Exponential retry backoff  · `apps/web/src/lib/use-project-socket.ts`
- [☐] Delivery timeout enforcement
- [☐] Duplicate event identifiers
- [☐] Out-of-order event documentation
- [☐] Manual event redelivery
- [~] Test event delivery  · `apps/worker/tests/notification-preferences.test.mjs`
- [✓] Repeated failure alerts  · `apps/web/tests/surface-states.test.mjs — "a failure box is announced once, not nested inside another alert"`
- [☐] Endpoint pause and resume
- [~] Secret-redacted delivery logs  · `apps/worker/src/redaction.ts`

## 46. SDK, CLI, AND DEVELOPER EXPERIENCE  —  0/20

- [☐] Published OpenAPI specification
- [☐] Interactive API reference
- [☐] Authentication examples
- [~] JavaScript client library  · `scripts/check-landing-budget.mjs`
- [~] TypeScript type definitions  · `apps/worker/src/types/golem-evals.d.ts`
- [☐] Python client library
- [☐] Supported Luau integration examples
- [~] Command-line authentication  · `apps/web/src/lib/auth-flows.ts`
- [☐] Command-line project management
- [☐] Command-line run execution
- [☐] Command-line run inspection
- [☐] Command-line artifact export
- [☐] SDK timeout configuration
- [☐] SDK retry configuration
- [☐] SDK pagination helpers
- [☐] SDK streaming helpers
- [☐] Structured SDK errors
- [☐] Versioned example applications
- [☐] Developer changelog
- [☐] SDK-to-API compatibility verification

## 47. INTEGRATIONS AND CREDENTIAL MANAGEMENT  —  2/20

- [☐] Integration catalog
- [☐] Integration capability descriptions
- [✗] Organization integration installation  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Project integration binding
- [☐] OAuth authorization flows
- [☐] Explicit requested scope display
- [☐] Integration account identification
- [☐] Connection health checks
- [☐] Credential expiration visibility
- [✓] Credential refresh handling  · `packages/corpus/src/intake/security.test.mjs — ".ROBLOSECURITY handling is credential theft"`
- [☐] Encrypted credential storage
- [~] Credential rotation  · `apps/worker/src/api-keys.ts`
- [☐] Credential revocation
- [☐] Integration disconnect
- [✓] Disconnect impact preview  · `apps/worker/tests/membership-lifecycle.test.mjs — "the impact preview counts what the departing member actually holds, and writes nothing"`
- [☐] Least-privilege credential usage
- [☐] Per-integration activity history
- [☐] Integration error diagnostics
- [☐] Revoked-access recovery guidance
- [☐] Prevention of credential exposure in AI context

## 48. PRIVACY AND DATA LIFECYCLE  —  0/20

- [☐] Personal data inventory
- [~] Data purpose documentation  · `apps/worker/src/rag.ts`
- [~] User-visible privacy settings  · `apps/web/src/routes/settings.tsx`
- [☐] Required consent recording
- [☐] Optional analytics consent controls
- [☐] Consent withdrawal
- [☐] User data export
- [✗] Organization data export  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Export identity verification
- [☐] Export availability expiration
- [☐] Account deletion request
- [☐] Account deletion status
- [✗] Organization deletion request  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Retention policy configuration
- [☐] Conversation retention controls
- [☐] Artifact retention controls
- [~] Log retention controls  · `apps/worker/src/analytics.ts`
- [☐] Deletion propagation to derived indexes
- [☐] Backup deletion lifecycle documentation
- [☐] Data processing and subprocessor disclosures

## 49. APPLICATION SECURITY  —  0/20

- [☐] Server-side input validation
- [☐] Output encoding
- [☐] Content security policy
- [☐] Cross-site request forgery protection
- [☐] Cross-origin access restrictions
- [☐] Secure cookie configuration
- [☐] Session fixation protection
- [☐] Server-side request forgery protection
- [☐] File upload content inspection
- [☐] Path traversal protection
- [☐] Command execution isolation
- [☐] Dependency vulnerability scanning
- [~] Secret scanning  · `apps/worker/tests/secret-redaction.test.mjs`
- [☐] Sensitive log redaction
- [☐] Encryption in transit
- [☐] Encryption at rest
- [☐] Administrative access restrictions
- [☐] Security configuration review
- [☐] Vulnerability reporting channel
- [☐] Security incident response procedures

## 50. AI SAFETY, ABUSE, AND SPENDING PROTECTION  —  4/20

- [✓] User request rate limits  · `apps/worker/tests/prefabs.test.mjs — "remote_guard rate-limits on the server and never trusts a client debounce"`
- [✗] Organization request rate limits  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] IP-based abuse controls
- [☐] Automated account abuse detection
- [☐] Credential stuffing protection
- [☐] Free-tier exploitation controls
- [☐] Prompt injection boundary enforcement
- [☐] Tool output trust separation
- [☐] Retrieved content trust separation
- [☐] Tool argument validation
- [~] Sandbox execution limits  · `apps/worker/src/sandbox.ts`
- [☐] External destination controls
- [☐] Secret and personal data leakage checks
- [~] Run duration limits  · `apps/worker/tests/run-duration.test.mjs`
- [✓] Per-run spending caps  · `packages/evals/src/economics.test.mjs — "the shipped spend gates cap the bill at the hard maximum, always"`
- [✓] Daily spending caps  · `apps/worker/tests/quota-day-boundary.test.mjs — "the monthly cap can bite before the daily one, and says so"`
- [✓] Monthly spending caps  · `apps/worker/tests/quota-day-boundary.test.mjs — "the monthly cap can bite before the daily one, and says so"`
- [✗] Organization emergency execution stop  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Suspicious usage review queue
- [☐] Abuse restriction appeal workflow

## 51. HELP, SUPPORT, AND CUSTOMER EDUCATION  —  1/20

- [☐] In-product help access
- [~] Contextual help links  · `apps/site/src/components/Cursor.astro`
- [☐] Searchable knowledge base
- [☐] Getting-started tutorials
- [☐] Studio connection troubleshooting
- [☐] Billing troubleshooting
- [☐] Model error troubleshooting
- [☐] Failed-run troubleshooting
- [☐] Known issue directory
- [☐] Support request submission
- [☐] Support request categorization
- [✓] Support request status  · `apps/worker/tests/analytics.test.mjs — "a request with no readable status is unclassified, not a success"`
- [☐] Support conversation history
- [☐] User-approved diagnostic attachment
- [☐] Diagnostic secret redaction
- [☐] Support identity verification
- [☐] Support escalation routing
- [☐] Plan-specific support expectations
- [☐] Feedback submission
- [~] Feature request tracking  · `packages/training/src/configs.test.mjs`

## 52. OWNER AND ADMIN OPERATIONS  —  1/20

- [☐] Administrative dashboard
- [✗] Organization lookup  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [~] Account lookup  · `apps/web/src/routes/auth-pages.tsx`
- [☐] Subscription lookup
- [☐] Usage investigation
- [☐] Credit transaction investigation
- [☐] Failed-run investigation
- [☐] Integration failure investigation
- [☐] Abuse case review
- [☐] Account suspension controls
- [☐] Account restoration controls
- [✗] Organization suspension controls  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Manual credit adjustment with reason
- [✓] Billing exception tracking  · `tests/check-escape-hatches.test.mjs — "the denominator matches the tracked source surface minus the exceptions"`
- [☐] Administrative action confirmation
- [☐] Administrative action audit logs
- [☐] Role-restricted administrative tools
- [☐] Time-limited support access
- [☐] Explicit user consent for support impersonation
- [☐] Complete support impersonation audit history

## 53. PRODUCT ANALYTICS  —  0/20

- [☐] Defined analytics event catalog
- [☐] Event schema validation
- [☐] Registration funnel
- [☐] Email verification funnel
- [☐] Onboarding completion funnel
- [☐] Studio pairing conversion
- [☐] First successful run activation
- [☐] First verified change activation
- [☐] Trial conversion
- [☐] Paid conversion
- [☐] Subscription retention
- [☐] Subscription cancellation reasons
- [☐] Cohort retention analysis
- [☐] Feature adoption
- [☐] Collaboration adoption
- [☐] Run success trends
- [☐] Verification success trends
- [☐] Cost per successful run
- [☐] Permission-aware internal analytics access
- [☐] Analytics data quality monitoring

## 54. LOGGING AND OBSERVABILITY  —  2/20

- [☐] Structured application logs
- [☐] Request correlation
- [☐] Run correlation
- [☐] Tool invocation correlation
- [☐] Studio operation correlation
- [☐] Provider request correlation
- [☐] Distributed request tracing
- [☐] Error aggregation
- [~] Error severity classification  · `apps/worker/src/providers/types.ts`
- [☐] Failed background job visibility
- [☐] Streaming interruption metrics
- [✓] Provider latency metrics  · `packages/evals/src/metrics.test.mjs — "a NaN latency is dropped from the latency metrics rather than making them NaN"`
- [✓] Database latency metrics  · `packages/evals/src/metrics.test.mjs — "a NaN latency is dropped from the latency metrics rather than making them NaN"`
- [☐] Queue delay metrics
- [☐] Webhook delivery metrics
- [☐] Usage metering anomaly alerts
- [☐] Log access controls
- [☐] Log retention enforcement
- [☐] Production debugging without secret exposure
- [☐] Links from user-visible failures to internal diagnostics

## 55. PERFORMANCE AND SCALING  —  1/20

- [☐] Page load performance budgets
- [☐] Application interaction performance budgets
- [☐] Time-to-first-response monitoring
- [☐] Streaming responsiveness targets
- [☐] Search latency targets
- [✓] Large conversation rendering  · `apps/worker/tests/export.test.mjs — "an empty conversation renders a valid file rather than throwing"`
- [☐] Large project directory rendering
- [☐] Large file upload handling
- [☐] Large artifact download handling
- [☐] Bounded database queries
- [☐] Database connection management
- [☐] Background queue concurrency limits
- [☐] Per-tenant workload fairness
- [☐] Provider concurrency limits
- [☐] Cache invalidation rules
- [☐] Permission-aware caching
- [☐] Autoscaling thresholds
- [☐] Capacity planning
- [☐] Peak workload testing
- [☐] Cost monitoring during scaling

## 56. DATA STORAGE, BACKUP, AND RESTORATION  —  0/20

- [☐] Defined authoritative data stores
- [☐] Durable conversation storage
- [☐] Durable run state storage
- [☐] Durable artifact storage
- [☐] Durable billing ledger storage
- [☐] Transactional critical updates
- [☐] Database constraint enforcement
- [☐] Schema migration tracking
- [☐] Automated database backups
- [☐] Object storage backup strategy
- [☐] Backup encryption
- [☐] Backup access restrictions
- [☐] Backup retention enforcement
- [☐] Point-in-time recovery capability
- [☐] Documented recovery objectives
- [☐] Restore procedure documentation
- [☐] Scheduled restoration drills
- [☐] Restored data integrity checks
- [☐] Cross-service restoration consistency checks
- [☐] Backup failure alerts

## 57. RELIABILITY AND INCIDENT MANAGEMENT  —  1/20

- [✓] Service health checks  · `packages/evals/tasks-visual/grade-visual.test.mjs — "a lit scene with untouched Lighting service properties still passes the lighting check"`
- [☐] Dependency health checks
- [☐] Defined service reliability objectives
- [☐] Availability monitoring
- [☐] Error rate alerting
- [☐] Latency alerting
- [☐] Queue backlog alerting
- [☐] Graceful provider failure handling
- [☐] Graceful database degradation
- [~] Bounded retry policies  · `apps/worker/src/automations.ts`
- [☐] Circuit breaker behavior
- [☐] Emergency feature disablement
- [☐] Incident severity classification
- [☐] Incident ownership
- [☐] Incident response runbooks
- [☐] Customer incident notifications
- [☐] Public incident status updates
- [☐] Incident resolution confirmation
- [☐] Post-incident review
- [☐] Corrective action tracking

## 58. TESTING AND QUALITY ASSURANCE  —  1/20

- [☐] Unit tests for critical business rules
- [~] Integration tests for service boundaries  · `apps/worker/tests/stubs/auth.mjs`
- [~] End-to-end registration tests  · `apps/web/tests/registration-entry.test.mjs`
- [☐] End-to-end Studio pairing tests
- [✓] End-to-end AI run tests  · `apps/worker/tests/public-api.test.mjs — "a test key cannot start a real run — the sandbox simulates it and says so"`
- [~] End-to-end approval tests  · `apps/worker/src/collab-threads.ts`
- [~] End-to-end rollback tests  · `tests/rollback-static.test.mjs`
- [~] End-to-end checkout tests  · `apps/web/src/lib/api.ts`
- [~] End-to-end subscription change tests  · `apps/worker/tests/billing-route.test.mjs`
- [~] Cross-tenant isolation tests  · `infra/supabase/tests/rls-isolation.mjs`
- [☐] Role and permission matrix tests
- [~] Concurrent spending tests  · `apps/worker/tests/single-flight.test.mjs`
- [☐] Payment event replay tests
- [☐] Interrupted streaming recovery tests
- [☐] Browser refresh recovery tests
- [☐] Accessibility workflow tests
- [☐] Hebrew and right-to-left workflow tests
- [☐] Supported browser tests
- [☐] Load and failure-injection tests
- [☐] Measured coverage of critical user journeys

## 59. DEPLOYMENT AND RELEASE OPERATIONS  —  0/20

- [☐] Separate development environments
- [☐] Separate staging environments
- [~] Separate production environments  · `infra/e2e.mjs`
- [☐] Environment-specific secrets
- [☐] Reproducible builds
- [☐] Dependency lockfile enforcement
- [☐] Build artifact versioning
- [☐] Automated type checking
- [☐] Automated quality checks
- [☐] Pre-deployment migration validation
- [~] Deployment approval policies  · `apps/worker/src/collab-threads.ts`
- [☐] Progressive release controls
- [~] Feature flag targeting  · `packages/evals/src/grade.mjs`
- [☐] Post-deployment smoke tests
- [☐] Deployment health monitoring
- [☐] Application rollback procedures
- [☐] Database compatibility during rollback
- [~] Plugin and server release compatibility  · `packages/evals/src/plugin-version.test.mjs`
- [~] Release notes linked to shipped changes  · `scripts/lib/release-rules.mjs`
- [☐] Retirement of temporary feature flags

## 60. END-TO-END RELEASE ACCEPTANCE  —  0/20

- [☐] New user completes registration and enters a usable workspace
- [✗] Invited member joins the intended organization with correct access  · `not planned — the owner chose a single-user product with per-project sharing on 2026-09-15; organizations and workspaces are not being built. See docs/design/TENANCY.md.`
- [☐] Returning user resumes the correct project and conversation
- [☐] User installs the Studio plugin and pairs the intended place
- [☐] User sees accurate connection and capability status
- [☐] User submits a request with relevant project context
- [☐] Agent presents an actionable plan with visible cost expectations
- [☐] User approves the exact operations that require consent
- [☐] Approved operations execute against the intended Studio session
- [☐] Studio changes produce persisted and inspectable results
- [☐] Verification reports distinguish passed, failed, and unverified outcomes
- [☐] User can inspect supporting evidence and operation history
- [☐] User can reverse changes and verify restored state
- [☐] Interrupted runs recover without duplicate writes or duplicate charges
- [☐] Collaborators receive only the access granted to them
- [☐] Plan limits are enforced consistently across UI, API, and background jobs
- [☐] Purchases update entitlements and credit balances accurately
- [☐] Cancellation, downgrade, and payment failure produce documented behavior
- [☐] Data export and deletion complete across primary and derived storage
- [☐] Production incidents are detected, communicated, and recoverable
