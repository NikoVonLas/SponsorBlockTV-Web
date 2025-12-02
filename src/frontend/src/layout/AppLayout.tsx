import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import clsx from "clsx";
import { useTranslation, type TranslationKey } from "../i18n";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";

const navItems: { to: string; labelKey: TranslationKey }[] = [
  { to: "/stats", labelKey: "app.nav.stats" },
  { to: "/devices", labelKey: "app.nav.devices" },
  { to: "/channels", labelKey: "app.nav.channels" },
  { to: "/config", labelKey: "app.nav.config" },
];

export const AppLayout = () => {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleCloseMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-canvas text-fg flex">
      <aside className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen md:flex-shrink-0 w-64 border-r border-border bg-surface-100">
        <div className="px-6 py-5 border-b border-border">
          <p className="text-lg font-semibold">{t("app.brandShort")}</p>
          <p className="text-sm text-muted">{t("app.brandSubtitle")}</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleCloseMobileMenu}
              className={({ isActive }) =>
                clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:bg-surface-200 hover:text-fg",
                )
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-border space-y-4">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-md bg-border/60 px-3 py-2 text-sm font-semibold text-fg hover:bg-border"
          >
            {t("app.logout")}
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col max-w-[100vw]">
        <header className="border-b border-border bg-surface-200 px-3 sm:px-4 py-3 flex items-center justify-between md:hidden">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("app.menu.open")}
          >
            {t("app.menu.open")}
          </button>
          <p className="font-semibold text-center flex-1 mx-3 truncate">{t("app.brandFull")}</p>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            {t("app.logout")}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-200 px-3 sm:px-4 py-4 sm:py-6 md:px-8">
          <Outlet />
        </main>
      </div>

      {mobileMenuOpen ? (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseMobileMenu}
            aria-hidden="true"
          />
          <div
            className="relative ml-0 w-64 max-w-full bg-surface-100 border-r border-border flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 py-4 border-b border-border flex items-center justify-between">
              <p className="font-semibold">{t("app.brandShort")}</p>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-sm"
                onClick={handleCloseMobileMenu}
                aria-label={t("app.menu.close")}
              >
                {t("app.menu.close")}
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleCloseMobileMenu}
                  className={({ isActive }) =>
                    clsx(
                      "block rounded-md px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-accent/20 text-accent"
                        : "text-muted hover:bg-surface-200 hover:text-fg",
                    )
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-border space-y-4">
              <LanguageSwitcher />
              <button
                type="button"
                onClick={() => {
                  handleCloseMobileMenu();
                  logout();
                }}
                className="w-full rounded-md bg-border/60 px-3 py-2 text-sm font-semibold text-fg hover:bg-border"
              >
                {t("app.logout")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
