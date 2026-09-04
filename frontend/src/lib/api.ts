import axios from "axios";

/**
 * Single shared API client. The token is attached from localStorage on every
 * request; a 401 on a request that carried one clears the session and returns
 * the user to /login. A 401 on a request that carried no token is left alone —
 * it is about that endpoint, not about who is signed in.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  headers: { Accept: "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    /*
     * Only a request that actually CARRIED the session can say the session is
     * over. A 401 from a call made without a token means that endpoint wanted
     * an account we never sent — a public page asking for something it should
     * not, a widget polling on a signed-out visitor — and treating it as an
     * expired session logged people out of tabs they were working in.
     *
     * Clearing the token is destructive and silent, so it needs the stronger
     * evidence: we presented a token, and the server refused it.
     */
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      localStorage.removeItem("authToken");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/** Standard backend envelope: { success, message, data }. */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Laravel paginator shape. */
export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

/** Per-field validation errors from a 422, e.g. { email: "…already taken" }. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError(err)) {
    const errs = (err.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors;
    if (errs) {
      return Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v?.[0] ?? ""]));
    }
  }
  return {};
}

/** Human-readable message from any thrown API error. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; errors?: Record<string, string[]> }
      | undefined;
    if (data?.errors) {
      const first = Object.values(data.errors)[0];
      if (first?.length) return first[0];
    }
    if (data?.message) return data.message;
    return err.message;
  }
  return "Something went wrong";
}
