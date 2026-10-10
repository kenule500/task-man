import axios from 'axios';
import { API_URL } from '@/config';
import { clearSession, getToken } from '@/utils/session';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the JWT to every request
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global 401 handling — clear session and redirect to login.
// Auth endpoints (login, signup…) handle their own 401s, so we skip them.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';

    if (status === 401 && getToken() && !url.startsWith('/auth/')) {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1');
      }
    }

    return Promise.reject(error);
  }
);

export const NETWORK_ERROR_MESSAGE = 'We could not reach the server. Check your connection and try again.';
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';

/**
 * Readable message from an API error: `{ message }`, express-validator `{ errors }` or a plain-text body.
 * Rate limiting and "no response at all" get their own wording; anything else falls back to `fallback`.
 */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const { response, request } = error as {
    response?: { status?: number; data?: unknown };
    request?: unknown;
  };
  if (!response) return request ? NETWORK_ERROR_MESSAGE : fallback;
  const data = response.data as { message?: string; errors?: { msg: string }[] } | string | undefined;
  if (typeof data === 'object' && data) {
    const message = data.message || data.errors?.[0]?.msg;
    if (message) return message;
  }
  if (response.status === 429) return RATE_LIMIT_MESSAGE;
  if (typeof data === 'string' && data.trim() && data.length < 200 && !data.trimStart().startsWith('<')) return data.trim();
  return fallback;
};

export default api;