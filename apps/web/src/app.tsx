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
import { AdminPage } from './routes/admin';
// LAZY, alone among the routes. The specimen book is a review surface — every approved
// block type with representative data, plus the rejection cases — and it is not linked
// from anywhere in the product, so statically importing it made every user download a
// page almost none of them will open.
//
// MEASURED, not estimated: the main bundle goes 213.75 kB -> 203.07 kB raw and
// 61.36 kB -> 57.65 kB gzipped, and `ui-lab-*.js` (12.38 kB / 4.88 kB) is fetched only
// on navigation. Deleting the route outright saves 15 kB raw rather than 10.7, because
// some of what it pulls in is shared with pages that do ship — which is why the first
// version of this comment quoted the wrong figure.
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
                    <Route path="/admin" element={<AdminPage />} />
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
