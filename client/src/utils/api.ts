import axios from 'axios';
import { API_URL } from '@/config';
import { clearSession, getToken } from '@/utils/session';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach the JWT token to every request if it exists
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// An expired or revoked session on a protected call: clear it and go back to login.
// Auth endpoints (login, signup...) handle their own 401s.
api.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    if (status === 401 && getToken() && !url.startsWith('/auth/')) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.assign('/login?expired=1');
    }
    return Promise.reject(error);
  },
);

/** Readable message from an API error (`{ message }` or express-validator `{ errors }`). */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: { message?: string; errors?: { msg: string }[] } } })
    .response?.data;
  return data?.message || data?.errors?.[0]?.msg || fallback;
};

export default api;