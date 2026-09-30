import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import DashboardMockup from '../components/landing/DashboardMockup';
import TrustedBy from '../components/landing/TrustedBy';
import Features from '../components/landing/Features';
import Pricing from '../components/landing/Pricing';
import About from '../components/landing/About';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';

const LandingPage = () => {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-background text-text-main">
      <Navbar />

      <main className="flex-grow flex flex-col items-center relative">
        <Hero />
        <DashboardMockup />
      </main>

      <TrustedBy />
      <Features />
      <Pricing />
      <About />
      <CTA />
      <Footer />
    </div>
  );
};

export default LandingPage;