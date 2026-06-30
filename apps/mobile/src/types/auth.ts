export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  role: "Admin" | "Member";
}

export interface MeResponse {
  user: User;
  tenant: { id: string; name: string };
  role: "Admin" | "Member";
}
