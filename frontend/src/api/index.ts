import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ""}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("secretome_token");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("secretome_token");
      localStorage.removeItem("secretome_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const message =
      err.response?.data?.detail ?? err.message ?? "Unknown error";
    return Promise.reject(new Error(message));
  }
);

export default api;
