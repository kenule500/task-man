import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';

const getAuthState = () => {
  try {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!token || !storedUser) return { isLoggedIn: false, dashboardUrl: '/signup' };

    const userData = JSON.parse(storedUser);
    if (userData.activeWorkspaceSlug) {
      return {
        isLoggedIn: true,
        dashboardUrl: `/${userData.activeWorkspaceSlug}/dashboard`,
      };
    }
    if (userData.onboardingComplete === false) {
      return { isLoggedIn: true, dashboardUrl: '/onboarding' };
    }
  } catch {
    // ignore
  }
  return { isLoggedIn: false, dashboardUrl: '/signup' };
};

const CTA = () => {
  const { isLoggedIn, dashboardUrl } = getAuthState();

  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-primary to-blue-600 rounded-3xl p-12 shadow-2xl shadow-primary/30">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {isLoggedIn ? 'Ready to get back to work?' : 'Ready to organize your work?'}
        </h2>
        <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
          {isLoggedIn
            ? 'Jump back into your workspace and pick up where you left off.'
            : 'Join thousands of teams already using TaskMan to ship faster and stay focused.'}
        </p>
        <Link
          to={dashboardUrl}
          className="inline-flex items-center gap-2 bg-white text-primary px-8 py-4 rounded-xl font-semibold text-lg hover:bg-slate-50 transition-all hover:-translate-y-0.5 shadow-lg"
        >
          {isLoggedIn ? 'Go to Dashboard' : 'Get Started for Free'}{' '}
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </section>
  );
};

export default CTA;