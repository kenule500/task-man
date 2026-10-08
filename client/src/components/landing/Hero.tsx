import { Link } from 'react-router-dom';
import { getStoredUser, getToken } from '../../utils/session';

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
  return { isLoggedIn: false, dashboardUrl: '/signup' };
};

const Hero = () => {
  const { isLoggedIn, dashboardUrl } = getAuthState();

  return (
    <div className="flex flex-col items-center justify-center text-center px-4 mt-32 md:mt-40 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-100/50 rounded-full blur-3xl -z-10 opacity-70"></div>

      <div className="animate-fade-in-up">
        <span className="inline-block py-1 px-3 rounded-full bg-blue-50 text-primary font-semibold tracking-wide text-xs mb-6 border border-blue-100">
          PLAN. ORGANIZE. ACHIEVE.
        </span>
      </div>

      <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 leading-tight max-w-4xl tracking-tight animate-fade-in-up animation-delay-100">
        Manage your tasks with{' '}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
          clarity
        </span>{' '}
        and ease.
      </h1>

      <p className="mt-6 text-lg md:text-xl text-gray-500 max-w-2xl animate-fade-in-up animation-delay-200">
        TaskMan helps you and your team track, prioritize, and deliver work effortlessly. Bring order to your chaos with a smart, minimal dashboard.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row gap-4 animate-fade-in-up animation-delay-300">
        <Link
          to={dashboardUrl}
          className="bg-primary text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-hover transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5"
        >
          {isLoggedIn ? 'Go to Dashboard' : 'Start for free'}
        </Link>
        <button className="bg-white text-gray-700 border border-gray-200 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-all hover:-translate-y-0.5">
          View Demo
        </button>
      </div>
    </div>
  );
};

export default Hero;