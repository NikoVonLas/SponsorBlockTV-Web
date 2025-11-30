import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../api/client";
import type { LoginResponse } from "../api/types";
import { useAuth } from "../auth/AuthProvider";

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation<LoginResponse, ApiError, { username: string; password: string }>({
    mutationFn: (payload) =>
      apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => {
      login(data.access_token, data.expires_in);
      const redirectTo =
        (location.state as { from?: Location })?.from?.pathname ?? "/config";
      navigate(redirectTo, { replace: true });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface-100 p-8 shadow-xl space-y-6"
      >
        <div>
          <h1 className="text-2xl font-semibold">SponsorBlockTV Web</h1>
          <p className="text-muted mt-1">Sign in to manage your automation node.</p>
        </div>
        <label className="block text-sm font-medium">
          Username
          <input
            className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
            value={password}
            type="password"
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {mutation.error && (
          <p className="text-sm text-red-400">
            {mutation.error.payload && typeof mutation.error.payload === "object"
              ? (mutation.error.payload as { detail?: string }).detail ?? "Login failed"
              : mutation.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {mutation.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
};
