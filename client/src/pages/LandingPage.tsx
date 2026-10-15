import { lazy, Suspense, useEffect, useState } from 'react';
import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import DashboardMockup from '../components/landing/DashboardMockup';
import Features from '../components/landing/Features';
import Teams from '../components/landing/Teams';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';

// The 3D board mock is decoration: it loads after the page is idle so the headline paints first (LCP)
const BoardStack3D = lazy(() => import('../components/landing/BoardStack3D'));

const HeroStack = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden className="mx-auto mt-10 h-72 w-full max-w-4xl px-4 md:h-80">
      {ready && <Suspense fallback={null}><BoardStack3D /></Suspense>}
    </div>
  );
};

const LandingPage = () => {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-text-main">
      <Navbar />

      <main id="main" className="flex flex-grow flex-col">
        <Hero />
        <HeroStack />
        <DashboardMockup />
        <Features />
        <Teams />
        <CTA />
      </main>

      <Footer />
    </div>
  );
};

export default LandingPage;
