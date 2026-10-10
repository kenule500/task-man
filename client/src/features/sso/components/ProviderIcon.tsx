import type { SsoProviderId } from '../types';

/** Simple geometric marks drawn with currentColor (no brand artwork, no external images). */
export const ProviderIcon = ({ provider, className = 'size-5' }: { provider: SsoProviderId; className?: string }) =>
  provider === 'microsoft' ? (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="currentColor">
      <rect x="3" y="3" width="8.5" height="8.5" rx="1" />
      <rect x="12.5" y="3" width="8.5" height="8.5" rx="1" />
      <rect x="3" y="12.5" width="8.5" height="8.5" rx="1" />
      <rect x="12.5" y="12.5" width="8.5" height="8.5" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.2 8.2A9 9 0 1 0 21 12h-8.5" />
    </svg>
  );
