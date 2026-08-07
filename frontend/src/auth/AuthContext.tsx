import { useEffect, useState, type ReactNode } from "react";
import { api, TOKEN_KEY, type User } from "../api";
import { AuthContext, type AuthState } from "./context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On load, a token in localStorage is only a claim. Verify it against /me
  // before trusting it — it may be expired, or the account may be gone.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const store = ({ token, user }: { token: string; user: User }) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(user);
  };

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) => store(await api.login(email, password)),
    signup: async (email, password, name) => store(await api.signup(email, password, name)),
    logout: async () => {
      // Tell the server first: it increments the user's token version, which
      // makes every token already issued to them stop verifying. Discarding
      // the token locally alone would leave it usable for the rest of its life
      // by anyone who had copied it.
      try {
        await api.logout();
      } catch {
        // A failed call must never trap someone in a signed-in state. The
        // server-side revocation is the belt; clearing local state is the
        // braces, and the braces always go on.
      }
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
