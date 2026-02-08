import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

api.interceptors.request.use((config) => {
  // Don't add Authorization header for login/register endpoints
  const isAuthEndpoint = config.url?.includes('/auth/login') || config.url?.includes('/auth/register');

  if (!isAuthEndpoint) {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
