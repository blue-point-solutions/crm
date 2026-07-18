import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { TokenPair } from "../types/auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function setTokens(tokens: TokenPair) {
  _accessToken = tokens.access_token;
  _refreshToken = tokens.refresh_token;
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
}

const client: AxiosInstance = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (_accessToken) {
    config.headers.set("Authorization", `Bearer ${_accessToken}`);
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && _refreshToken) {
      original._retry = true;
      try {
        const { data } = await axios.post<TokenPair>(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: _refreshToken }
        );
        setTokens(data);
        original.headers["Authorization"] = `Bearer ${data.access_token}`;
        return client(original);
      } catch {
        clearTokens();
      }
    }
    return Promise.reject(err);
  }
);

export default client;
