import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import clsx from "clsx";

const navItems = [
  { to: "/config", label: "Config" },
  { to: "/devices", label: "Devices" },
  { to: "/channels", label: "Channels" },
];

export const AppLayout = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-canvas text-fg flex">
      <aside className="hidden md:flex md:flex-col w-64 border-r border-border bg-surface-100">
        <div className="px-6 py-5 border-b border-border">
          <p className="text-lg font-semibold">SponsorBlockTV Web</p>
          <p className="text-sm text-muted">Control Center</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:bg-surface-200 hover:text-fg",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-md bg-border/60 px-3 py-2 text-sm font-semibold text-fg hover:bg-border"
          >
            Log out
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-border bg-surface-200 px-4 py-3 flex justify-between items-center md:hidden">
          <p className="font-semibold">SponsorBlockTV Web</p>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-border px-3 py-1 text-sm"
          >
            Logout
          </button>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-200 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
