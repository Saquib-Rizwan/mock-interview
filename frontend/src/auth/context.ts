import { createContext } from "react";
import type { User } from "../api";

export type AuthState = {
  user: User | null;
  // Distinguishes "still checking the stored token" from "definitely logged
  // out". Without it the app would flash the login page on every refresh.
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  // Async now: it tells the server to revoke the token before discarding it.
  logout: () => Promise<void>;
};

// Kept apart from the provider component so AuthContext.tsx exports only
// components, which is what Vite's fast refresh requires.
export const AuthContext = createContext<AuthState | null>(null);
