import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { User, Bell, Lock } from 'lucide-react';

interface UserData {
  _id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
}

const sections = [
  { id: 'profile', label: 'Profile', description: 'Your public information', icon: User },
  { id: 'notifications', label: 'Notifications', description: 'Email & push preferences', icon: Bell },
  { id: 'security', label: 'Security', description: 'Password & account safety', icon: Lock },
];

const SettingsLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [user] = useState<UserData | null>(() => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch { return null; }
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) {
      navigate('/login');
    }
  }, [navigate, user]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  // Determine active section from URL
  const activeSection = location.pathname.split('/').pop() || 'profile';
  const isActive = (id: string) => activeSection === id;

  if (!user) return null;

  return (
    <Sidebar user={user} onLogout={handleLogout}>
      <div className="w-full">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your account and preferences</p>
        </header>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 max-w-6xl">

          {/* Left: Section Navigation */}
          <nav className="space-y-1 lg:sticky lg:top-6 h-fit">
            {sections.map(({ id, label, description, icon: Icon }) => {
              const active = isActive(id);
              return (
                <button
                  key={id}
                  onClick={() => navigate(`/settings/${id}`)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-xl transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      active ? 'text-primary' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p
                      className={`text-xs mt-0.5 truncate ${
                        active ? 'text-primary/70' : 'text-slate-400'
                      }`}
                    >
                      {description}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Right: Active Section */}
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </Sidebar>
  );
};

export default SettingsLayout;