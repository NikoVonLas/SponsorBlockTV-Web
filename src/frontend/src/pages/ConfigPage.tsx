import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  useConfigQuery,
  useSkipCategoryOptions,
  useUpdateConfigMutation,
} from "../api/hooks";
import type { ConfigUpdateRequest } from "../api/types";
import { useTranslation, type TranslationKey } from "../i18n";

type BooleanField = {
  key:
    | "skip_ads"
    | "mute_ads"
    | "skip_count_tracking"
    | "auto_play"
    | "use_proxy";
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
};

const booleanFieldConfigs: BooleanField[] = [
  {
    key: "skip_ads",
    labelKey: "config.automation.fields.skip_ads.label",
    descriptionKey: "config.automation.fields.skip_ads.description",
  },
  {
    key: "mute_ads",
    labelKey: "config.automation.fields.mute_ads.label",
    descriptionKey: "config.automation.fields.mute_ads.description",
  },
  {
    key: "skip_count_tracking",
    labelKey: "config.automation.fields.skip_count_tracking.label",
    descriptionKey: "config.automation.fields.skip_count_tracking.description",
  },
  {
    key: "auto_play",
    labelKey: "config.automation.fields.auto_play.label",
    descriptionKey: "config.automation.fields.auto_play.description",
  },
  {
    key: "use_proxy",
    labelKey: "config.automation.fields.use_proxy.label",
    descriptionKey: "config.automation.fields.use_proxy.description",
  },
];

export const ConfigPage = () => {
  const { data: config, isLoading, error } = useConfigQuery();
  const { data: skipCategoryOptions } = useSkipCategoryOptions();
  const updateMutation = useUpdateConfigMutation();
  const { t } = useTranslation();

  const [joinName, setJoinName] = useState("");
  const [apikey, setApikey] = useState("");
  const [minSkip, setMinSkip] = useState(1);

  useEffect(() => {
    if (config) {
      setJoinName(config.join_name);
      setApikey(config.apikey);
      setMinSkip(config.minimum_skip_length);
    }
  }, [config]);

  const selectedCategories = useMemo(
    () => new Set(config?.skip_categories ?? []),
    [config?.skip_categories],
  );

  const handleToggle = (field: BooleanField["key"], value: boolean) => {
    const patch: ConfigUpdateRequest = { [field]: value } as ConfigUpdateRequest;
    updateMutation.mutate(patch);
  };

  const handleIdentitySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateMutation.mutate({
      join_name: joinName,
      apikey,
      minimum_skip_length: Number(minSkip),
    });
  };

  const handleCategoryToggle = (value: string) => {
    if (!config) return;
    const next = selectedCategories.has(value)
      ? config.skip_categories.filter((category) => category !== value)
      : [...config.skip_categories, value];
    updateMutation.mutate({ skip_categories: next });
  };

  if (isLoading || !config) {
    return <p className="text-muted">{t("config.loading")}</p>;
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">{t("config.title")}</h1>
        <p className="text-muted mt-1">{t("config.subtitle")}</p>
      </header>

      {(error || updateMutation.error) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {(error ?? updateMutation.error)?.message ?? t("config.error")}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface-100 p-6">
        <h2 className="text-lg font-semibold">{t("config.automation.title")}</h2>
        <div className="mt-4 divide-y divide-border">
          {booleanFieldConfigs.map((field) => (
            <label
              key={field.key}
              className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{t(field.labelKey)}</p>
                <p className="text-sm text-muted">{t(field.descriptionKey)}</p>
              </div>
              <input
                type="checkbox"
                className="h-6 w-6 accent-accent"
                checked={Boolean(config[field.key])}
                onChange={(event) => handleToggle(field.key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6">
        <h2 className="text-lg font-semibold">{t("config.identity.title")}</h2>
        <form className="mt-4 grid gap-6 md:grid-cols-2" onSubmit={handleIdentitySubmit}>
          <label className="text-sm font-medium">
            {t("config.identity.joinName")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            {t("config.identity.apiKey")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={apikey}
              onChange={(event) => setApikey(event.target.value)}
            />
            <span className="text-xs text-muted">
              {t("config.identity.apiKeyHint")}
            </span>
          </label>
          <label className="text-sm font-medium max-w-xs">
            {t("config.identity.minimumSkip")}
            <input
              type="number"
              min={0}
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={minSkip}
              onChange={(event) => setMinSkip(Number(event.target.value))}
              required
            />
          </label>
          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? t("config.identity.submitting")
                : t("config.identity.submit")}
            </button>
            {updateMutation.isSuccess && (
              <span className="text-sm text-green-300">{t("common.saved")}</span>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6">
        <h2 className="text-lg font-semibold">{t("config.skipCategories.title")}</h2>
        <p className="text-sm text-muted">{t("config.skipCategories.description")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(skipCategoryOptions ?? []).map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={selectedCategories.has(option.value)}
                onChange={() => handleCategoryToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};
