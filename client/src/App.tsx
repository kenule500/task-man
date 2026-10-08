import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { PermissionProvider } from './context/PermissionProvider';
import PermissionRoute from './components/PermissionRoute';
import WorkspaceLayout from './components/WorkspaceLayout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import JoinWorkspacePage from './pages/JoinWorkspacePage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import TeamMembersPage from './pages/TeamMembersPage';
import WorkspaceSettingsPage from './pages/WorkspaceSettingsPage';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import SecurityPage from './pages/SecurityPage';
import SettingsLayout from './components/SettingsLayout';
import TaskPage from './pages/TaskPage';
import ProjectsPage from './pages/ProjectsPage';
import ReportsPage from './pages/ReportsPage';
import HelpPage from './pages/HelpPage';
import DesignSystemPage from './pages/DesignSystemPage';
import PwaPrompt from './pwa/PwaPrompt';
import OfflineBanner from './pwa/OfflineBanner';

function App() {
  return (
    <Router>
      <PermissionProvider>
        <div className="min-h-screen bg-background text-gray-800">
          <Routes>
            {/* ========== Public routes ========== */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/design-system" element={<DesignSystemPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/join/:inviteCode" element={<JoinWorkspacePage />} />
            <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />

            {/* ========== User settings — has its own layout with sidebar ========== */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/profile" replace />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="security" element={<SecurityPage />} />
            </Route>

            {/* ========== Workspace-scoped routes — share ONE persistent Sidebar ========== */}
            <Route element={<WorkspaceLayout />}>
              {/* Dashboard: no permission required beyond membership */}
              <Route path="/:workspaceSlug/dashboard" element={<DashboardPage />} />

              {/* Tasks: requires tasks:read */}
              <Route
                path="/:workspaceSlug/tasks"
                element={
                  <PermissionRoute permission="tasks:read">
                    <TaskPage />
                  </PermissionRoute>
                }
              />

              {/* Projects: requires projects:read */}
              <Route
                path="/:workspaceSlug/projects"
                element={
                  <PermissionRoute permission="projects:read">
                    <ProjectsPage />
                  </PermissionRoute>
                }
              />

              {/* Team: requires users:read */}
              <Route
                path="/:workspaceSlug/team"
                element={
                  <PermissionRoute permission="users:read">
                    <TeamMembersPage />
                  </PermissionRoute>
                }
              />

              {/* Calendar: no permission required */}
              <Route
                path="/:workspaceSlug/calendar"
                element={<TaskPage defaultView="calendar" />}
              />

              {/* Reports: requires reports:read */}
              <Route
                path="/:workspaceSlug/reports"
                element={
                  <PermissionRoute permission="reports:read">
                    <ReportsPage />
                  </PermissionRoute>
                }
              />

              {/* Workspace settings: requires settings:manage */}
              <Route
                path="/:workspaceSlug/settings"
                element={
                  <PermissionRoute permission="settings:manage">
                    <WorkspaceSettingsPage />
                  </PermissionRoute>
                }
              />

              {/* Help: no permission required */}
              <Route
                path="/:workspaceSlug/help"
                element={<HelpPage />}
              />
            </Route>

            {/* ========== Catch all ========== */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>

        {/* PWA components — must be inside the provider so they can use context */}
        <OfflineBanner />
        <PwaPrompt />
      </PermissionProvider>
    </Router>
  );
}

export default App;