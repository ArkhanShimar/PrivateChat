import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true, // send HTTP-only cookies
});

// Attach token from localStorage as fallback (for environments where cookies don't work cross-origin)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('lc_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
