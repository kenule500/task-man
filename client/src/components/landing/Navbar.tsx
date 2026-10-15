import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { getLandingAuth } from './landingAuth';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#teams', label: 'Teams and roles' },
];

const PRIMARY_LINK =
  'rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const Navbar = () => {
  const { isLoggedIn, appUrl } = getLandingAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape closes the mobile menu
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-100 bg-white/90 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:shadow-lg"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 md:px-8 md:py-4">
        <Link to="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-white">T</span>
          TaskMan
        </Link>

        <ul className="hidden items-center gap-8 text-sm font-medium text-slate-700 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <a href={href} className="rounded transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 sm:gap-4">
          {isLoggedIn ? (
            <Link to={appUrl} className={PRIMARY_LINK}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden min-h-10 items-center rounded px-2 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary sm:inline-flex"
              >
                Sign in
              </Link>
              <Link to="/signup" className={PRIMARY_LINK}>
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:hidden"
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-slate-100 bg-white px-4 pb-4 pt-2 md:hidden">
          <ul className="flex flex-col">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {label}
                </a>
              </li>
            ))}
            {!isLoggedIn && (
              <li>
                <Link
                  to="/login"
                  className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary sm:hidden"
                >
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  );
};

export default Navbar;
