import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export const RequireAuth = ({ children }: PropsWithChildren) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export const PublicOnly = ({ children }: PropsWithChildren) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    const redirectTo =
      (location.state as { from?: Location })?.from?.pathname ?? "/config";
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};
