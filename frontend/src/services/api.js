import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

api.interceptors.request.use((config) => {
  // Don't add Authorization header for login/register endpoints
  const isAuthEndpoint = config.url?.includes('/auth/login') || config.url?.includes('/auth/register');

  if (!isAuthEndpoint) {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log(`🔐 Auth token added for ${config.method?.toUpperCase()} ${config.url}`);
    } else {
      console.warn(`⚠️ No token in localStorage for ${config.method?.toUpperCase()} ${config.url}`);
    }
  }

  console.log(`📡 Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('❌ 401 Unauthorized - Invalid or missing token');
      console.error('   Response:', error.response.data);
    } else if (error.response?.status === 403) {
      console.error('❌ 403 Forbidden - Account not approved or access denied');
      console.error('   Response:', error.response.data);
    }
    return Promise.reject(error);
  }
);

export default api;
