// App root: providers + router (basename /app).
import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/error-boundary';
import { ToastProvider } from './components/toast';
import { CommandProvider } from './lib/commands';
import { ThemeProvider } from './lib/theme';
import { AuthGuard, AuthProvider, GuestGuard } from './lib/auth';
import { AppLayout } from './components/layout';
import { ConfirmEmailPage, ForgotPasswordPage, LoginPage, RecoveryRequestPage, ResetPasswordPage, SignupPage } from './routes/auth-pages';
import { DashboardPage } from './routes/dashboard';
import { WorkspacePage } from './routes/workspace';
// LAZY, on a measurement rather than a hunch. `scripts/check-app-bundle.mjs` budgets the entry
// graph at 70 kB gzipped, a figure measured when the entry WAS 54.2 kB. It then went unenforced —
// the build job stopped at an earlier failure, so nobody saw the check — while the app grew, and
// by the time it ran again the entry was 181 kB gzipped. Attributing the entry chunk through its
// sourcemap gave the three cheapest routes to move:
//
//     settings.tsx   52,735 B of generated code   the largest single file in the entry
//     usage.tsx      16,917 B
//     roadmap.tsx     8,703 B
//
// None is a landing. Settings and usage are reached from the layout's own navigation, and the
// roadmap hangs off a project the user has already opened — so each is a click that has always
// cost a render, and now costs a fetch inside the same click. That is the same trade already made
// for /admin below, with the same fallback.
//
// NOT WORKSPACE, deliberately. Its subtree — the route plus the ws components plus generative-ui
// — is about 198 kB of the entry and is far and away the largest remaining piece, and it is also
// the busiest path in the product. This app has no DOM test environment (see
// walkable-routes.test.mjs: no jsdom, no testing-library), so a route that is split cannot be
// watched rendering here; the three above are chosen because losing one for a release costs a
// settings page, and losing the workspace costs the product. The measured debt is recorded in
// docs/backlog/WEB-BUNDLE-BUDGET-OPEN.md, not closed.
//
// AND A NOTE FOR WHOEVER EDITS THIS COMMENT. The first draft of it wrote that subtree as a glob
// with a star after the slash. Several checks in this repository strip comments from this file with
// a naive block-comment regex before matching it, and that two-character sequence opened a comment
// that ran to the next close — swallowing 60 lines of the route table. Two tests went red on the
// text of a comment. Do not put that sequence in this file.
const RoadmapPage = lazy(() => import('./routes/roadmap').then((m) => ({ default: m.RoadmapPage })));
const UsagePage = lazy(() => import('./routes/usage').then((m) => ({ default: m.UsagePage })));
const SettingsPage = lazy(() => import('./routes/settings').then((m) => ({ default: m.SettingsPage })));
// Lazy for the same reason as usage: reached from the dock, and it carries the pack manifest.
const LibraryPage = lazy(() => import('./routes/library').then((m) => ({ default: m.LibraryPage })));
// Lazy for the same reason, and one more. The admin console is rendered only for
// `is_admin` profiles, so for very nearly every user this was 10.7 kB raw / 2.4 kB
// gzipped of a page they cannot use. Splitting it also stops the console's shape — the
// kill switch, the spend limits, the routing diagnostics — from sitting in a bundle any
// signed-in reader can open. That is not a security boundary (the routes are
// ADMIN_KEY-guarded server-side and always were) but there is no reason to publish it.
const AdminPage = lazy(() => import('./routes/admin').then((m) => ({ default: m.AdminPage })));
// LAZY, alone among the routes — AND NOW DEV-ONLY. The specimen book is a review surface:
// every approved block type with representative data, plus the rejection cases, including
// documents carrying `javascript:alert(1)` so a reviewer can watch the sanitiser refuse
// them. It is not linked from anywhere in the product, and splitting it was the first half
// of the answer to "why does every customer download this".
//
// The other half is that splitting it does not stop a customer OPENING it. Any signed-in
// person could type /app/ui-lab, or follow a link somebody pasted, and land on an internal
// review page. `import.meta.env.DEV` is a build-time constant, so in production this is
// `() => null`, the dynamic import is unreachable and the chunk is not emitted at all —
// MEASURED: after this change `grep -rl 'ui-lab\|UI lab\|CANONICAL STATES' dist/` returns
// nothing at all, where before it returned the chunk. The route registration below is
// removed in the same breath, so the path falls through to Not found rather than to a
// blank screen.
//
// MEASURED just now, `vite build` both ways: with the route registered, the build emits
// `ui-lab-*.js` at 13.80 kB (5.29 gzip) and the entry is 589.80 kB (173.12 gzip). Gated,
// there is no such chunk and the entry is 586.71 kB (171.99 gzip) — so gating it also
// takes 3.09 kB of shared code out of the entry that splitting alone left behind.
//
// THIS SENTENCE USED TO READ "Only these two are lazy", and the three declarations above made it
// false the moment they landed. Five routes are lazy now — admin, ui-lab, settings, usage and
// roadmap. What still holds is the second half: dashboard and workspace are where a user lands,
// and splitting those would trade bundle size for a round trip on the path that matters most.
const UiLabPage = import.meta.env.DEV
  ? lazy(() => import('./routes/ui-lab').then((m) => ({ default: m.UiLabPage })))
  : () => null;
const StudioPreviewPage = import.meta.env.DEV ? lazy(() => import('./routes/studio-preview').then((m) => ({ default: m.StudioPreviewPage }))) : () => null;
import { JoinPage } from './routes/join';
import { NotFoundPage } from './routes/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter basename="/app">
              <AuthProvider>
                {/* Inside AuthProvider and the router: commands navigate and act as the signed-in
                    user, so the registry has to sit where both are available. */}
                <CommandProvider>
                <Routes>
                  {import.meta.env.DEV && <Route path="/studio-preview" element={<Suspense fallback={<div>Loading preview…</div>}><StudioPreviewPage /></Suspense>} />}
                  <Route
                    path="/login"
                    element={
                      <GuestGuard>
                        <LoginPage />
                      </GuestGuard>
                    }
                  />
                  <Route
                    path="/signup"
                    element={
                      <GuestGuard>
                        <SignupPage />
                      </GuestGuard>
                    }
                  />
                  <Route
                    path="/forgot"
                    element={
                      <GuestGuard>
                        <ForgotPasswordPage />
                      </GuestGuard>
                    }
                  />
                  {/* NEITHER GUARD. Both of these are where an emailed link lands, and
                      `detectSessionInUrl` turns the token in the fragment into a real session
                      before the component renders — so GuestGuard would bounce the holder of a
                      valid recovery link straight to the dashboard, still using the password they
                      came here to replace, with no screen to replace it on. AuthGuard would be
                      just as wrong in the other direction: a confirmation link that did NOT
                      establish a session would be redirected to /login, and the person who clicked
                      it would never learn whether it worked. */}
                  {/* NO GuestGuard EITHER, and for a third reason. Somebody can be signed in on
                      one device and locked out of another — a phone that was replaced, a second
                      factor that is gone — and bouncing them to the dashboard because THIS browser
                      has a session would hide the only page that helps. It costs nothing to leave
                      open: the form reveals nothing and the route it posts to reveals nothing. */}
                  <Route path="/recovery" element={<RecoveryRequestPage />} />
                  <Route path="/reset" element={<ResetPasswordPage />} />
                  <Route path="/confirm" element={<ConfirmEmailPage />} />
                  <Route
                    element={
                      <AuthGuard>
                        <AppLayout />
                      </AuthGuard>
                    }
                  >
                    <Route index element={<DashboardPage />} />
                    {/* The shelf lives at the index, and `/projects/:id` is a project on it — so
                        `/app/projects` was the one address in between that resolved to nothing and
                        fell through to "This apple is lost". Nothing in the product LINKS there;
                        people arrive by deleting the id off a project URL they were given, which is
                        the ordinary way anyone walks up a path. A redirect rather than a second
                        mounting of DashboardPage, so the shelf keeps exactly one canonical URL. */}
                    <Route path="/projects" element={<Navigate to="/" replace />} />
                    <Route path="/projects/:id" element={<WorkspacePage />} />
                    {/* The plan for one project. Scoped under the project
                        because a roadmap without one has nothing to describe. */}
                    <Route
                      path="/projects/:id/roadmap"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <RoadmapPage />
                        </Suspense>
                      }
                    />
                    {/* Where a share link lands. INSIDE the guard on purpose: redeeming mints a
                        membership for the signed-in person, so a signed-out visitor is sent to
                        /login and returned here with the token intact — see AuthGuard. */}
                    <Route path="/join" element={<JoinPage />} />
                    <Route
                      path="/usage"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <UsagePage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/library"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <LibraryPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <SettingsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <AdminPage />
                        </Suspense>
                      }
                    />
                    {/* DEV ONLY — the same treatment /studio-preview already gets a few lines up,
                        and for a stronger reason. This is an internal review surface: it renders
                        "CANONICAL STATES · M01–M10", "Tone is a property of the state, not a prop"
                        and, deliberately, hostile documents carrying `javascript:alert(1)` and
                        `<img src=x onerror=alert(1)>` so a reviewer can watch the sanitiser refuse
                        them. Every one of those is a correct thing for a reviewer to see and a
                        bewildering thing for a customer to find, and any signed-in person could
                        find it by typing the path or following a shared link.
                        THE ROUTE ITSELF IS OMITTED rather than the element blanked, so in
                        production /app/ui-lab falls through to `path="*"` and gets the ordinary
                        Not found page — a route that renders nothing is a blank screen, which is
                        the failure this repository keeps finding in a different costume.
                        NOT A SECURITY BOUNDARY, and it was never protecting anything: the
                        specimens are fixtures, the XSS cases are inert by construction, and the
                        bundle they lived in was already public. It is the same judgement as the
                        admin split above — there is no reason to publish it. */}
                    {import.meta.env.DEV && (
                      <Route
                        path="/ui-lab"
                        element={
                          <Suspense fallback={<div className="page" aria-busy="true" />}>
                            <UiLabPage />
                          </Suspense>
                        }
                      />
                    )}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
                </CommandProvider>
              </AuthProvider>
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
