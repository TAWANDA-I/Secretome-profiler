export interface AuthUser {
  id: string;
  email: string;
  has_api_key: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  has_api_key: boolean;
}

export const authApi = {
  register: async (email: string, password: string, inviteCode = ""): Promise<LoginResponse> => {
    const res = await fetch("${import.meta.env.VITE_API_URL ?? ""}/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, invite_code: inviteCode }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Registration failed");
    }
    return res.json();
  },

  login: async (email: string, password: string): Promise<LoginResponse> => {
    const form = new FormData();
    form.append("username", email);
    form.append("password", password);
    const res = await fetch("${import.meta.env.VITE_API_URL ?? ""}/api/v1/auth/login", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login failed");
    }
    return res.json();
  },

  getMe: async (): Promise<AuthUser> => {
    const token = localStorage.getItem("secretome_token");
    const res = await fetch("${import.meta.env.VITE_API_URL ?? ""}/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Not authenticated");
    return res.json();
  },

  saveApiKey: async (key: string): Promise<void> => {
    const token = localStorage.getItem("secretome_token");
    const res = await fetch("${import.meta.env.VITE_API_URL ?? ""}/api/v1/auth/api-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ anthropic_api_key: key }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to save key");
    }
  },

  deleteApiKey: async (): Promise<void> => {
    const token = localStorage.getItem("secretome_token");
    await fetch("${import.meta.env.VITE_API_URL ?? ""}/api/v1/auth/api-key", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};

export function storeAuth(data: LoginResponse): void {
  localStorage.setItem("secretome_token", data.access_token);
  localStorage.setItem(
    "secretome_user",
    JSON.stringify({
      id: data.user_id,
      email: data.email,
      has_api_key: data.has_api_key,
      created_at: new Date().toISOString(),
    })
  );
}

export function clearAuth(): void {
  localStorage.removeItem("secretome_token");
  localStorage.removeItem("secretome_user");
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("secretome_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem("secretome_token");
}
