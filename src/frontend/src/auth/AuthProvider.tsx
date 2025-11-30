import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";

type AuthState = {
  token: string | null;
  expiresAt: number | null;
};

type AuthContextValue = {
  token: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  login: (token: string, expiresIn: number) => void;
  logout: () => void;
};

const storageKey = "sbtv_auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const getInitialState = (): AuthState => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { token: null, expiresAt: null };
    }
    const parsed: AuthState = JSON.parse(raw);
    if (!parsed.token || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(storageKey);
      return { token: null, expiresAt: null };
    }
    return parsed;
  } catch {
    return { token: null, expiresAt: null };
  }
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AuthState>(() => getInitialState());

  const login = useCallback((token: string, expiresIn: number) => {
    const expiresAt = Date.now() + expiresIn * 1000;
    const nextState: AuthState = { token, expiresAt };
    setState(nextState);
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, expiresAt: null });
    window.localStorage.removeItem(storageKey);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: state.token,
      expiresAt: state.expiresAt,
      isAuthenticated: Boolean(state.token && state.expiresAt && state.expiresAt > Date.now()),
      login,
      logout,
    }),
    [state.expiresAt, state.token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
