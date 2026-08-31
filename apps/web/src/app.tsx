// App root: providers + router (basename /app).
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
import { UiLabPage } from './routes/ui-lab';
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
                    <Route path="/ui-lab" element={<UiLabPage />} />
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
