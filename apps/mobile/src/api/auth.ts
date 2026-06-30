import client, { setTokens, clearTokens } from "./client";
import { MeResponse, TokenPair } from "../types/auth";

export async function login(email: string, password: string): Promise<TokenPair> {
  const { data } = await client.post<TokenPair>("/auth/login", { email, password });
  setTokens(data);
  return data;
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<TokenPair> {
  const { data } = await client.post<TokenPair>("/auth/register", {
    email,
    password,
    name,
  });
  setTokens(data);
  return data;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await client.get<MeResponse>("/me");
  return data;
}

export function logout() {
  clearTokens();
}
