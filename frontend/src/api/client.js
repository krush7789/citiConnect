import axios from "axios";

const TOKEN_STORAGE_KEY = "citiconnect_access_token";
const USER_STORAGE_KEY = "citiconnect_user";

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const BASE_URL = RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;

const authFreePaths = ["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/refresh"];

let unauthorizedHandler = () => {};
let refreshPromise = null;

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === "function" ? handler : () => {};
};

export const getStoredToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);
export const setStoredToken = (token) => {
  if (!token) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

export const clearStoredAuth = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
};

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const isAuthFreePath = (url = "") => authFreePaths.some((path) => url.includes(path));

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post("/auth/refresh", {})
      .then((response) => {
        const nextToken = response.data?.access_token;
        if (!nextToken) {
          throw new Error("Missing access token in refresh response");
        }
        setStoredToken(nextToken);
        return nextToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    if (status !== 401 || originalRequest._retry || isAuthFreePath(originalRequest.url)) {
      const envelope = error.response?.data?.error;
      if (envelope) {
        error.normalized = {
          code: envelope.code || "UNKNOWN",
          message: envelope.message || "Request failed",
          details: envelope.details || {},
        };
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const nextToken = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${nextToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearStoredAuth();
      unauthorizedHandler();
      return Promise.reject(refreshError);
    }
  }
);

export const createError = (code, message, details = {}) => ({
  normalized: { code, message, details },
});

export { TOKEN_STORAGE_KEY, USER_STORAGE_KEY };
export default api;
