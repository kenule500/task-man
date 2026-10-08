import { Link } from 'react-router-dom';
import { getStoredUser, getToken } from '../../utils/session';

// Helper — reads auth state once, no effect required
const getAuthState = () => {
  const user = getStoredUser();
  if (getToken() && user) {
    if (user.activeWorkspaceSlug) {
      return { isLoggedIn: true, dashboardUrl: `/${user.activeWorkspaceSlug}/dashboard` };
    }
    if (user.onboardingComplete === false) {
      return { isLoggedIn: true, dashboardUrl: '/onboarding' };
    }
  }
  return { isLoggedIn: false, dashboardUrl: '/login' };
};

const Navbar = () => {
  const { isLoggedIn, dashboardUrl } = getAuthState();

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="flex justify-between items-center px-6 md:px-8 py-4 max-w-7xl mx-auto">
        <Link to="/" className="text-2xl font-bold text-primary tracking-tight flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white text-sm">T</div>
          TaskMan
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <a href="#features" className="hover:text-primary transition-colors">Features</a>
          <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
          <a href="#about" className="hover:text-primary transition-colors">About</a>
        </div>
        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <Link
              to={dashboardUrl}
              className="bg-primary text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-primary-hover transition-all shadow-sm hover:shadow-md"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors">
                Log In
              </Link>
              <Link
                to="/signup"
                className="bg-primary text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-primary-hover transition-all shadow-sm hover:shadow-md"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;