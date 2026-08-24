"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api } from "@/lib/api-client";
import type {
  AuthResponse,
  ProfileUpdate,
  RegisterPayload,
  RegisterResponse,
  User,
} from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const LAST_INSTITUTION_KEY = "aiqms-last-institution";

function rememberInstitution(code: string) {
  try {
    localStorage.setItem(LAST_INSTITUTION_KEY, code);
  } catch {
    // storage unavailable (private mode) — prefill is a nicety, not a need
  }
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  institutionCode: string | null;
  setSession: (tokens: AuthResponse, user?: User | null, institutionCode?: string | null) => void;
  setUser: (user: User | null) => void;
  clearSession: () => void;
  verifyInstitution: (code: string) => Promise<{ name: string; type: string | null; is_active: boolean }>;
  login: (institutionCode: string, email: string, password: string) => Promise<void>;
  register: (
    payload: RegisterPayload
  ) => Promise<{ institutionCode: string }>;
  updateProfile: (payload: ProfileUpdate) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => void;
}

export function lastUsedInstitution(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_INSTITUTION_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      institutionCode: null,

      setSession: (tokens, user = null, institutionCode = null) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user,
          ...(institutionCode ? { institutionCode } : {}),
        }),

      setUser: (user) => set({ user }),
      clearSession: () =>
        set({ accessToken: null, refreshToken: null, user: null }),

      verifyInstitution: async (code) => {
        const res = await fetch(`${API_BASE}/auth/institution/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail ?? "Institution not found");
        return body as { name: string; type: string | null; is_active: boolean };
      },

      login: async (institutionCode, email, password) => {
        const normalized = institutionCode.trim().toUpperCase();
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institution_code: normalized,
            email,
            password,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail ?? "Login failed");
        const tokens = body as AuthResponse;
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          institutionCode: normalized,
        });
        rememberInstitution(normalized);
        const me = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (me.ok) set({ user: (await me.json()) as User });
      },

      register: async (payload) => {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail ?? "Registration failed");
        const tokens = body as RegisterResponse;
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          institutionCode: tokens.institution_code,
        });
        rememberInstitution(tokens.institution_code);
        // Fetch the profile immediately — role-gated UI depends on it.
        const me = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (me.ok) set({ user: (await me.json()) as User });
        return { institutionCode: tokens.institution_code };
      },

      updateProfile: async (payload) => {
        const user = await api.patch<User>("/auth/me", payload);
        set({ user });
      },

      changePassword: async (currentPassword, newPassword) => {
        const tokens = await api.post<AuthResponse>("/auth/change-password", {
          current_password: currentPassword,
          new_password: newPassword,
        });
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        });
      },

      refresh: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) return false;
        try {
          const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          const body = await res.json();
          if (!res.ok) {
            get().clearSession();
            return false;
          }
          set({
            accessToken: body.access_token,
            refreshToken: body.refresh_token,
          });
          return true;
        } catch {
          return false;
        }
      },

      logout: () => {
        get().clearSession();
      },
    }),
    {
      name: "aiqms-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        institutionCode: state.institutionCode,
      }),
    }
  )
);
