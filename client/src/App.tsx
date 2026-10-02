import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import PlaceholderPage from './pages/PlaceholderPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import JoinWorkspacePage from './pages/JoinWorkspacePage';
import ProfilePage from './pages/ProfilePage';
import SecurityPage from './pages/SecurityPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsLayout from './components/SettingsLayout';
import TaskPage from './pages/TaskPage';

function App() {
  return (
    <Router>
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

          {/* User settings — layout wrapper with nested routes */}
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="security" element={<SecurityPage />} />
          </Route>

          {/* Workspace-scoped routes */}
          <Route path="/:workspaceSlug/dashboard" element={<DashboardPage />} />
          <Route path="/:workspaceSlug/tasks" element={<TaskPage />} />
          <Route path="/:workspaceSlug/projects" element={<PlaceholderPage title="Projects" />} />
          <Route path="/:workspaceSlug/team" element={<PlaceholderPage title="Team Members" />} />
          <Route path="/:workspaceSlug/calendar" element={<TaskPage defaultView="calendar" />} />
          <Route path="/:workspaceSlug/reports" element={<PlaceholderPage title="Reports" />} />
          <Route path="/:workspaceSlug/settings" element={<PlaceholderPage title="Settings" />} />
          <Route path="/:workspaceSlug/help" element={<PlaceholderPage title="Help & Center" />} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;