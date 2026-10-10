import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PermissionProvider } from './context/PermissionProvider';
import { PageLoader, SkeletonCards, Toaster, TopProgressBar } from './components/ds';
import PermissionRoute from './components/PermissionRoute';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import PwaPrompt from './pwa/PwaPrompt';
import OfflineBanner from './pwa/OfflineBanner';

// Only the landing and sign-in pages ship in the first bundle; every other screen loads on demand.
const loaders = {
  workspaceLayout: () => import('./components/WorkspaceLayout'),
  settingsLayout: () => import('./components/SettingsLayout'),
  dashboard: () => import('./pages/DashboardPage'),
  tasks: () => import('./pages/TaskPage'),
  projects: () => import('./pages/ProjectsPage'),
  projectDetail: () => import('./pages/ProjectDetailPage'),
  reports: () => import('./pages/ReportsPage'),
  roadmap: () => import('./pages/RoadmapPage'),
  workload: () => import('./pages/WorkloadPage'),
  team: () => import('./pages/TeamMembersPage'),
  help: () => import('./pages/HelpPage'),
  // The style guide is large and public; load it only when someone opens it
  designSystem: () => import('./pages/DesignSystemPage'),
};

const WorkspaceLayout = lazy(loaders.workspaceLayout);
const SettingsLayout = lazy(loaders.settingsLayout);
const DashboardPage = lazy(loaders.dashboard);
const TaskPage = lazy(loaders.tasks);
const ProjectsPage = lazy(loaders.projects);
const ProjectDetailPage = lazy(loaders.projectDetail);
const ReportsPage = lazy(loaders.reports);
const RoadmapPage = lazy(loaders.roadmap);
const WorkloadPage = lazy(loaders.workload);
const SprintReportPage = lazy(() => import('./pages/SprintReportPage'));
const TeamMembersPage = lazy(loaders.team);
const HelpPage = lazy(loaders.help);
const DesignSystemPage = lazy(loaders.designSystem);
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const JoinWorkspacePage = lazy(() => import('./pages/JoinWorkspacePage'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'));
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const WorkflowSettingsPage = lazy(() => import('./pages/WorkflowSettingsPage'));
const DevelopersPage = lazy(() => import('./pages/DevelopersPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));

// A page chunk that is slow to arrive shows the top progress bar (after 160ms) over skeleton cards;
// the first load of a whole layout shows the branded full-page loader.
const PageFallback = () => (
  <div className="mx-auto max-w-5xl p-6">
    <TopProgressBar />
    <SkeletonCards count={3} columns="sm:grid-cols-3" />
  </div>
);

const ShellFallback = () => (
  <>
    <TopProgressBar />
    <PageLoader />
  </>
);

/** Suspense boundary for one lazily loaded screen; layouts stay mounted while the page chunk arrives. */
const Lazy = ({ children, shell = false }: { children: ReactNode; shell?: boolean }) => (
  <Suspense fallback={shell ? <ShellFallback /> : <PageFallback />}>{children}</Suspense>
);

/** Screens the user most likely opens next, keyed by the current route. */
const likelyNext = (pathname: string): (() => Promise<unknown>)[] => {
  if (/^\/(login|signup)\/?$/.test(pathname)) return [loaders.workspaceLayout, loaders.dashboard];
  if (/^\/[^/]+\/dashboard\/?$/.test(pathname)) return [loaders.tasks, loaders.projects, loaders.reports];
  if (/^\/[^/]+\/(tasks|calendar)\/?$/.test(pathname)) return [loaders.projects, loaders.dashboard];
  if (/^\/[^/]+\/projects\/?$/.test(pathname)) return [loaders.projectDetail, loaders.tasks];
  return [];
};

/** Warms the chunks of likely-next routes once the browser is idle (skipped on Data Saver). */
const IdlePrefetch = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const targets = likelyNext(pathname);
    if (targets.length === 0) return;

    const run = () => { targets.forEach(load => { void load().catch(() => undefined); }); };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(run, 1500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
};

function App() {
  return (
    <Router>
      <PermissionProvider>
        <div className="min-h-screen bg-background text-slate-800">
          <Routes>
            {/* ========== Public routes ========== */}
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/design-system"
              element={
                <Lazy>
                  <DesignSystemPage />
                </Lazy>
              }
            />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            <Route path="/verify-email/:token" element={<Lazy><VerifyEmailPage /></Lazy>} />
            <Route path="/forgot-password" element={<Lazy><ForgotPasswordPage /></Lazy>} />
            <Route path="/reset-password/:token" element={<Lazy><ResetPasswordPage /></Lazy>} />
            <Route path="/onboarding" element={<Lazy><OnboardingPage /></Lazy>} />
            <Route path="/join/:inviteCode" element={<Lazy><JoinWorkspacePage /></Lazy>} />
            <Route path="/accept-invite/:token" element={<Lazy><AcceptInvitePage /></Lazy>} />

            {/* ========== User settings — has its own layout with sidebar ========== */}
            <Route path="/settings" element={<Lazy shell><SettingsLayout /></Lazy>}>
              <Route index element={<Navigate to="/settings/profile" replace />} />
              <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
              <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
              <Route path="security" element={<Lazy><SecurityPage /></Lazy>} />
            </Route>

            {/* ========== Workspace-scoped routes — share ONE persistent Sidebar ========== */}
            <Route element={<Lazy shell><WorkspaceLayout /></Lazy>}>
              {/* Dashboard: no permission required beyond membership */}
              <Route path="/:workspaceSlug/dashboard" element={<Lazy><DashboardPage /></Lazy>} />

              {/* Tasks: requires tasks:read */}
              <Route
                path="/:workspaceSlug/tasks"
                element={
                  <PermissionRoute permission="tasks:read">
                    <Lazy><TaskPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Projects: requires projects:read */}
              <Route
                path="/:workspaceSlug/projects"
                element={
                  <PermissionRoute permission="projects:read">
                    <Lazy><ProjectsPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Project detail (sprints, backlog, overview): requires projects:read */}
              <Route
                path="/:workspaceSlug/projects/:projectId"
                element={
                  <PermissionRoute permission="projects:read">
                    <Lazy><ProjectDetailPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Sprint report: requires projects:read */}
              <Route
                path="/:workspaceSlug/projects/:projectId/sprints/:sprintId/report"
                element={
                  <PermissionRoute permission="projects:read">
                    <Lazy><SprintReportPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Roadmap (epics over time): requires projects:read */}
              <Route
                path="/:workspaceSlug/roadmap"
                element={
                  <PermissionRoute permission="projects:read">
                    <Lazy><RoadmapPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Workload (points per person): requires projects:read */}
              <Route
                path="/:workspaceSlug/workload"
                element={
                  <PermissionRoute permission="projects:read">
                    <Lazy><WorkloadPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Team: requires users:read */}
              <Route
                path="/:workspaceSlug/team"
                element={
                  <PermissionRoute permission="users:read">
                    <Lazy><TeamMembersPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Calendar: no permission required */}
              <Route
                path="/:workspaceSlug/calendar"
                element={
                  <PermissionRoute permission="tasks:read">
                    <Lazy><TaskPage defaultView="calendar" /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Reports: requires reports:read */}
              <Route
                path="/:workspaceSlug/reports"
                element={
                  <PermissionRoute permission="reports:read">
                    <Lazy><ReportsPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Workspace settings: requires settings:manage */}
              <Route
                path="/:workspaceSlug/settings"
                element={
                  <PermissionRoute permission="settings:manage">
                    <Lazy><WorkspaceSettingsPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Audit log: requires settings:manage */}
              <Route
                path="/:workspaceSlug/settings/audit"
                element={
                  <PermissionRoute permission="settings:manage">
                    <Lazy><AuditLogPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Automation rules: requires settings:manage */}
              <Route
                path="/:workspaceSlug/settings/automations"
                element={
                  <PermissionRoute permission="settings:manage">
                    <Lazy><AutomationsPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Workflow stages (board columns): requires settings:manage */}
              <Route
                path="/:workspaceSlug/settings/workflow"
                element={
                  <PermissionRoute permission="settings:manage">
                    <Lazy><WorkflowSettingsPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Developers: personal API tokens (every member) and webhooks (settings:manage, checked on the page) */}
              <Route
                path="/:workspaceSlug/settings/developers"
                element={
                  <PermissionRoute permission="tasks:read">
                    <Lazy><DevelopersPage /></Lazy>
                  </PermissionRoute>
                }
              />

              {/* Inbox: the signed-in user's own notifications, no permission required */}
              <Route path="/:workspaceSlug/inbox" element={<Lazy><InboxPage /></Lazy>} />

              {/* Help: no permission required */}
              <Route
                path="/:workspaceSlug/help"
                element={<Lazy><HelpPage /></Lazy>}
              />
            </Route>

            {/* ========== Catch all ========== */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>

        {/* PWA components — must be inside the provider so they can use context */}
        <IdlePrefetch />
        {/* Top banners stack instead of covering each other (offline + update available) */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col">
          <OfflineBanner />
          <PwaPrompt />
        </div>
        <Toaster />
      </PermissionProvider>
    </Router>
  );
}

export default App;