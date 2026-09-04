import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { clearAllDrafts } from "../lib/formDraft";
import type { User } from "../types";

/**
 * What a sign-in attempt produced. A resident's portal account is created
 * FOR them when they are registered, so the first attempt does not sign them
 * in: it sends a code to the address on their record, and entering that is
 * what turns the account on.
 */
export type LoginResult =
  | { kind: "signed-in"; user: User }
  | { kind: "needs-activation"; email: string; otpSent: boolean; message: string };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Second half of a first sign-in: the emailed code. */
  activate: (email: string, password: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Where an account lands after login. */
export function homePathFor(user: User): string {
  return user.role === "Resident" ? "/portal" : "/dashboard";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verify = async () => {
      if (!localStorage.getItem("authToken")) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get("/auth/me");
        setUser(response.data.data);
      } catch {
        localStorage.removeItem("authToken");
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  /** Stores the issued token and puts the account into the session. */
  const adopt = (payload: { user: User; token: string }): User => {
    localStorage.setItem("authToken", payload.token);
    setUser(payload.user);
    return payload.user;
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const response = await api.post("/auth/login", { email, password });
    const data = response.data.data;

    // No token means the credentials were right but the account has never
    // been activated — the caller shows the code entry instead of navigating.
    if (data?.requires_activation) {
      return {
        kind: "needs-activation",
        email: data.email,
        otpSent: !!data.otp_sent,
        message: response.data.message,
      };
    }

    return { kind: "signed-in", user: adopt(data) };
  };

  const activate = async (email: string, password: string, code: string): Promise<User> => {
    const response = await api.post("/auth/activate", { email, password, code });
    return adopt(response.data.data);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Token may already be invalid — clearing locally is enough.
    }
    localStorage.removeItem("authToken");
    /*
     * Half-typed forms go with the session. A draft holds residents' names,
     * birthdates and phone numbers, and the next person at this desk has no
     * business seeing them — which is also why the form promises they last
     * only until logout.
     */
    clearAllDrafts();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, activate, logout, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
