import { Navigate, createBrowserRouter } from "react-router-dom";
import { RequireAuth, PublicOnly } from "./auth/RequireAuth";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ConfigPage } from "./pages/ConfigPage";
import { DevicesPage } from "./pages/DevicesPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { StatsPage } from "./pages/StatsPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/stats" replace /> },
      { path: "/config", element: <ConfigPage /> },
      { path: "/devices", element: <DevicesPage /> },
      { path: "/channels", element: <ChannelsPage /> },
      { path: "/stats", element: <StatsPage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/stats" replace />,
  },
]);
