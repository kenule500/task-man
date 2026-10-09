import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import DashboardMockup from '../components/landing/DashboardMockup';
import Features from '../components/landing/Features';
import Teams from '../components/landing/Teams';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';

const LandingPage = () => {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-text-main">
      <Navbar />

      <main id="main" className="flex flex-grow flex-col">
        <Hero />
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
