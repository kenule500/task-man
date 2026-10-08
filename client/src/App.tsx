import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { PermissionProvider } from './context/PermissionProvider';
import PermissionRoute from './components/PermissionRoute';
import WorkspaceLayout from './components/WorkspaceLayout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import PlaceholderPage from './pages/PlaceholderPage';
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

function App() {
  return (
    <Router>
      <PermissionProvider>
        <div className="min-h-screen bg-background text-gray-800">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/join/:inviteCode" element={<JoinWorkspacePage />} />
            <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />

            {/* User settings — has its own layout with sidebar */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/profile" replace />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="security" element={<SecurityPage />} />
            </Route>

            {/* Workspace-scoped routes — share ONE persistent Sidebar */}
            <Route element={<WorkspaceLayout />}>
              <Route path="/:workspaceSlug/dashboard" element={<DashboardPage />} />
              <Route
                path="/:workspaceSlug/tasks"
                element={
                  <PermissionRoute permission="tasks:read">
                    <TaskPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="/:workspaceSlug/projects"
                element={
                  <PermissionRoute permission="projects:read">
                    <PlaceholderPage title="Projects" />
                  </PermissionRoute>
                }
              />
              <Route
                path="/:workspaceSlug/team"
                element={
                  <PermissionRoute permission="users:read">
                    <TeamMembersPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="/:workspaceSlug/calendar"
                element={<PlaceholderPage title="Calendar" />}
              />
              <Route
                path="/:workspaceSlug/reports"
                element={
                  <PermissionRoute permission="reports:read">
                    <PlaceholderPage title="Reports" />
                  </PermissionRoute>
                }
              />
              <Route
                path="/:workspaceSlug/settings"
                element={
                  <PermissionRoute permission="settings:manage">
                    <WorkspaceSettingsPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="/:workspaceSlug/help"
                element={<PlaceholderPage title="Help & Center" />}
              />
            </Route>

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </PermissionProvider>
    </Router>
  );
}

export default App;