import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type TranslationShape } from "./locales/en";
import { ru } from "./locales/ru";

const translations = {
  en,
  ru,
} as const;

type Locale = keyof typeof translations;

type DotNestedKeys<T> = T extends object
  ? {
      [K in Extract<keyof T, string>]: T[K] extends object
        ? `${K}` | `${K}.${DotNestedKeys<T[K]>}`
        : `${K}`;
    }[Extract<keyof T, string>]
  : never;

type TranslationKey = DotNestedKeys<TranslationShape>;

type TranslationParams = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const I18N_STORAGE_KEY = "sbtv_locale";

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const isLocale = (value: string | null | undefined): value is Locale =>
  value === "en" || value === "ru";

const resolveKey = (dict: TranslationShape, key: string): string | undefined => {
  return key.split(".").reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === "object" && segment in acc) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, dict) as string | undefined;
};

const formatValue = (value: string, params?: TranslationParams): string => {
  if (!params) {
    return value;
  }
  return value.replace(/\{(\w+)\}/g, (match, group) => {
    if (group in params) {
      return String(params[group]);
    }
    return match;
  });
};

const detectInitialLocale = (): Locale => {
  if (typeof window === "undefined") {
    return "en";
  }
  const stored = localStorage.getItem(I18N_STORAGE_KEY);
  if (isLocale(stored)) {
    return stored;
  }
  const navigatorLocale = navigator.language?.slice(0, 2).toLowerCase();
  if (isLocale(navigatorLocale)) {
    return navigatorLocale;
  }
  return "en";
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(I18N_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = translations[locale] ?? translations.en;
    const fallback = translations.en;
    const translate: I18nContextValue["t"] = (key, params) => {
      const resolved = resolveKey(dictionary, key) ?? resolveKey(fallback, key) ?? key;
      return formatValue(resolved, params);
    };
    return {
      locale,
      setLocale,
      t: translate,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return ctx;
};

export type { Locale, TranslationKey };
