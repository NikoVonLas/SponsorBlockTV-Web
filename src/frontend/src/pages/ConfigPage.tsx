import { useEffect, useMemo, useState } from "react";
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

const skipCategoryFieldConfigs: Array<{
  value: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  {
    value: "sponsor",
    labelKey: "config.skipCategories.items.sponsor.label",
    descriptionKey: "config.skipCategories.items.sponsor.description",
  },
  {
    value: "selfpromo",
    labelKey: "config.skipCategories.items.selfpromo.label",
    descriptionKey: "config.skipCategories.items.selfpromo.description",
  },
  {
    value: "intro",
    labelKey: "config.skipCategories.items.intro.label",
    descriptionKey: "config.skipCategories.items.intro.description",
  },
  {
    value: "outro",
    labelKey: "config.skipCategories.items.outro.label",
    descriptionKey: "config.skipCategories.items.outro.description",
  },
  {
    value: "music_offtopic",
    labelKey: "config.skipCategories.items.music_offtopic.label",
    descriptionKey: "config.skipCategories.items.music_offtopic.description",
  },
  {
    value: "interaction",
    labelKey: "config.skipCategories.items.interaction.label",
    descriptionKey: "config.skipCategories.items.interaction.description",
  },
  {
    value: "exclusive_access",
    labelKey: "config.skipCategories.items.exclusive_access.label",
    descriptionKey: "config.skipCategories.items.exclusive_access.description",
  },
  {
    value: "poi_highlight",
    labelKey: "config.skipCategories.items.poi_highlight.label",
    descriptionKey: "config.skipCategories.items.poi_highlight.description",
  },
  {
    value: "preview",
    labelKey: "config.skipCategories.items.preview.label",
    descriptionKey: "config.skipCategories.items.preview.description",
  },
  {
    value: "filler",
    labelKey: "config.skipCategories.items.filler.label",
    descriptionKey: "config.skipCategories.items.filler.description",
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
  type FieldKey = "join_name" | "apikey" | "minimum_skip_length";
  type FieldStatus = "idle" | "saving" | "saved" | "error";
  const [fieldStatus, setFieldStatus] = useState<Record<FieldKey, FieldStatus>>({
    join_name: "idle",
    apikey: "idle",
    minimum_skip_length: "idle",
  });

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
  const skipCategoryOptionValues = useMemo(
    () => new Set((skipCategoryOptions ?? []).map((option) => option.value)),
    [skipCategoryOptions],
  );
  const orderedCategoryFields = useMemo(
    () => skipCategoryFieldConfigs.filter((field) => skipCategoryOptionValues.has(field.value)),
    [skipCategoryOptionValues],
  );
  const extraCategoryOptions = useMemo(
    () =>
      (skipCategoryOptions ?? []).filter(
        (option) => !skipCategoryFieldConfigs.some((field) => field.value === option.value),
      ),
    [skipCategoryOptions],
  );

  const handleToggle = (field: BooleanField["key"], value: boolean) => {
    const patch: ConfigUpdateRequest = { [field]: value } as ConfigUpdateRequest;
    updateMutation.mutate(patch);
  };

  const updateFieldState = (key: FieldKey, status: FieldStatus) => {
    setFieldStatus((prev) => ({ ...prev, [key]: status }));
  };

  const handleGeneralUpdate = async (
    payload: ConfigUpdateRequest,
    fieldKey: FieldKey,
  ): Promise<void> => {
    updateFieldState(fieldKey, "saving");
    try {
      await updateMutation.mutateAsync(payload);
      updateFieldState(fieldKey, "saved");
      setTimeout(() => updateFieldState(fieldKey, "idle"), 2000);
    } catch {
      updateFieldState(fieldKey, "error");
    }
  };

  const handleJoinNameBlur = async () => {
    if (!config) return;
    const trimmed = joinName.trim();
    if (!trimmed || trimmed === config.join_name) {
      setJoinName(trimmed);
      return;
    }
    await handleGeneralUpdate({ join_name: trimmed }, "join_name");
  };

  const handleApiKeyBlur = async () => {
    if (!config || apikey === config.apikey) {
      return;
    }
    await handleGeneralUpdate({ apikey }, "apikey");
  };

  const handleMinimumSkipBlur = async () => {
    if (!config) return;
    const parsed = Number(minSkip);
    if (Number.isNaN(parsed) || parsed === config.minimum_skip_length) {
      setMinSkip(config.minimum_skip_length);
      return;
    }
    await handleGeneralUpdate({ minimum_skip_length: parsed }, "minimum_skip_length");
  };

  const fieldStatusLabel = (key: FieldKey) => {
    const state = fieldStatus[key];
    if (state === "saving") {
      return <span className="text-xs text-muted">{t("config.general.saving")}</span>;
    }
    if (state === "saved") {
      return <span className="text-xs text-green-300">{t("common.saved")}</span>;
    }
    if (state === "error") {
      return <span className="text-xs text-red-400">{t("common.requestFailed")}</span>;
    }
    return null;
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
        <h2 className="text-lg font-semibold">{t("config.general.title")}</h2>
        <div className="mt-4 flex flex-col gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("config.general.joinName")}
              <input
                className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                onBlur={handleJoinNameBlur}
                required
              />
            </label>
            {fieldStatusLabel("join_name")}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("config.general.apiKey")}
              <input
                className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                value={apikey}
                onChange={(event) => setApikey(event.target.value)}
                onBlur={handleApiKeyBlur}
              />
              <span className="text-xs text-muted">{t("config.general.apiKeyHint")}</span>
            </label>
            {fieldStatusLabel("apikey")}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("config.general.minimumSkip")}
              <input
                type="number"
                min={0}
                className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                value={minSkip}
                onChange={(event) => setMinSkip(Number(event.target.value))}
                onBlur={handleMinimumSkipBlur}
                required
              />
            </label>
            {fieldStatusLabel("minimum_skip_length")}
          </div>
        </div>
      </section>

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
        <h2 className="text-lg font-semibold">{t("config.skipCategories.title")}</h2>
        <div className="mt-4 divide-y divide-border">
          {orderedCategoryFields.map((field) => (
              <label
                key={field.value}
                className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{t(field.labelKey)}</p>
                  <p className="text-sm text-muted">{t(field.descriptionKey)}</p>
                </div>
                <input
                  type="checkbox"
                  className="h-6 w-6 accent-accent"
                  checked={selectedCategories.has(field.value)}
                  onChange={() => handleCategoryToggle(field.value)}
                />
              </label>
            ))}
            {extraCategoryOptions.map((option) => (
              <label
                key={option.value}
                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{option.label}</p>
                  <p className="text-sm text-muted">
                    {t("config.skipCategories.fallbackDescription")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-accent"
                  checked={selectedCategories.has(option.value)}
                  onChange={() => handleCategoryToggle(option.value)}
                />
              </label>
            ))}
          </div>
      </section>
    </div>
  );
};
