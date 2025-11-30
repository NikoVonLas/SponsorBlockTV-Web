import clsx from "clsx";
import { useTranslation } from "./index";
import type { Locale } from "./index";

type LanguageSwitcherProps = {
  className?: string;
};

export const LanguageSwitcher = ({ className }: LanguageSwitcherProps) => {
  const { locale, setLocale, t } = useTranslation();

  return (
    <select
      className={clsx(
        "w-full rounded-md border border-border bg-surface-100 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/50",
        className,
      )}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      aria-label={t("common.languageLabel")}
    >
      <option value="en">{t("common.english")}</option>
      <option value="ru">{t("common.russian")}</option>
    </select>
  );
};
