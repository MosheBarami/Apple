// App root: providers + router (basename /app).
import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/error-boundary';
import { ToastProvider } from './components/toast';
import { Cursor, Grain } from './components/atmosphere';
import { ThemeProvider } from './lib/theme';
import { AuthGuard, AuthProvider, GuestGuard } from './lib/auth';
import { AppLayout } from './components/layout';
import { LoginPage, SignupPage } from './routes/auth-pages';
import { DashboardPage } from './routes/dashboard';
import { WorkspacePage } from './routes/workspace';
import { RoadmapPage } from './routes/roadmap';
import { UsagePage } from './routes/usage';
import { SettingsPage } from './routes/settings';
// Lazy for the same reason, and one more. The admin console is rendered only for
// `is_admin` profiles, so for very nearly every user this was 10.7 kB raw / 2.4 kB
// gzipped of a page they cannot use. Splitting it also stops the console's shape — the
// kill switch, the spend limits, the routing diagnostics — from sitting in a bundle any
// signed-in reader can open. That is not a security boundary (the routes are
// ADMIN_KEY-guarded server-side and always were) but there is no reason to publish it.
const AdminPage = lazy(() => import('./routes/admin').then((m) => ({ default: m.AdminPage })));
// LAZY, alone among the routes. The specimen book is a review surface — every approved
// block type with representative data, plus the rejection cases — and it is not linked
// from anywhere in the product, so statically importing it made every user download a
// page almost none of them will open.
//
// MEASURED, not estimated: with this route and the admin one split out, the main bundle
// goes 213.75 kB -> 193.24 kB raw and 61.36 kB -> 55.48 kB gzipped. `ui-lab-*.js`
// (12.37 kB / 4.88 kB) is fetched only on navigation. Deleting the route outright would
// save more than splitting it does, because some of what it pulls in is shared with
// pages that ship anyway — which is why the first version of this comment had the wrong
// figure in it.
//
// Only these two are lazy. Dashboard and workspace are where a user lands, and splitting
// those would trade bundle size for a round trip on the path that matters most.
const UiLabPage = lazy(() => import('./routes/ui-lab').then((m) => ({ default: m.UiLabPage })));
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
                <Routes>
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
                    element={
                      <AuthGuard>
                        <AppLayout />
                      </AuthGuard>
                    }
                  >
                    <Route index element={<DashboardPage />} />
                    <Route path="/projects/:id" element={<WorkspacePage />} />
                    {/* The plan for one project. Scoped under the project
                        because a roadmap without one has nothing to describe. */}
                    <Route path="/projects/:id/roadmap" element={<RoadmapPage />} />
                    <Route path="/usage" element={<UsagePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route
                      path="/admin"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <AdminPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/ui-lab"
                      element={
                        <Suspense fallback={<div className="page" aria-busy="true" />}>
                          <UiLabPage />
                        </Suspense>
                      }
                    />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </AuthProvider>
            </BrowserRouter>
            <Grain />
            <Cursor />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
