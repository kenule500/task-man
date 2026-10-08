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

/** Readable message from an API error (`{ message }` or express-validator `{ errors }`). */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const data = (
    error as {
      response?: { data?: { message?: string; errors?: { msg: string }[] } };
    }
  ).response?.data;
  return data?.message || data?.errors?.[0]?.msg || fallback;
};

export default api;