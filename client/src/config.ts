// Build-time configuration (Vite env). Kept in one module so tests can stub it.
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';
