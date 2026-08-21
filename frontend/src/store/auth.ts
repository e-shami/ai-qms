"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuthResponse, RegisterPayload, User } from "@/types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setSession: (tokens: AuthResponse, user?: User | null) => void;
  setUser: (user: User | null) => void;
  clearSession: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setSession: (tokens, user = null) =>
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, user }),

      setUser: (user) => set({ user }),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null }),

      login: async (email, password) => {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail ?? "Login failed");
        const tokens = body as AuthResponse;
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
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
        const tokens = body as AuthResponse;
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
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
          set({ accessToken: body.access_token, refreshToken: body.refresh_token });
          return true;
        } catch {
          get().clearSession();
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
      }),
    }
  )
);