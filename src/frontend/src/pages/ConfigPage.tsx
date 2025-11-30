import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  useConfigQuery,
  useSkipCategoryOptions,
  useUpdateConfigMutation,
} from "../api/hooks";
import type { ConfigUpdateRequest } from "../api/types";

// Type helper replaced below
type BooleanField = {
  key:
    | "skip_ads"
    | "mute_ads"
    | "skip_count_tracking"
    | "auto_play"
    | "use_proxy";
  label: string;
  description: string;
};

const booleanFieldConfigs: BooleanField[] = [
  {
    key: "skip_ads",
    label: "Skip ads",
    description: "Automatically skip skippable ads and speed through sponsor blocks.",
  },
  {
    key: "mute_ads",
    label: "Mute ads",
    description: "Mute audio while unskippable ads are being shown.",
  },
  {
    key: "skip_count_tracking",
    label: "Track skip counts",
    description: "Record how many segments were skipped for diagnostics.",
  },
  {
    key: "auto_play",
    label: "Auto play",
    description: "Resume playback instantly when a new video loads.",
  },
  {
    key: "use_proxy",
    label: "Use proxy",
    description: "Route SponsorBlockTV requests through the configured proxy.",
  },
];

export const ConfigPage = () => {
  const { data: config, isLoading, error } = useConfigQuery();
  const { data: skipCategoryOptions } = useSkipCategoryOptions();
  const updateMutation = useUpdateConfigMutation();

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
    return <p className="text-muted">Loading configuration…</p>;
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Global configuration</h1>
        <p className="text-muted mt-1">
          Tweak how SponsorBlockTV behaves across every paired device.
        </p>
      </header>

      {(error || updateMutation.error) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {(error ?? updateMutation.error)?.message ?? "Configuration request failed."}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface-100 p-6">
        <h2 className="text-lg font-semibold">Automation behaviour</h2>
        <div className="mt-4 divide-y divide-border">
          {booleanFieldConfigs.map((field) => (
            <label
              key={field.key}
              className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{field.label}</p>
                <p className="text-sm text-muted">{field.description}</p>
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
        <h2 className="text-lg font-semibold">Identity & minimums</h2>
        <form className="mt-4 grid gap-6 md:grid-cols-2" onSubmit={handleIdentitySubmit}>
          <label className="text-sm font-medium">
            Join name
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            YouTube API key
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={apikey}
              onChange={(event) => setApikey(event.target.value)}
            />
            <span className="text-xs text-muted">
              Required for channel search. Stored only on your host.
            </span>
          </label>
          <label className="text-sm font-medium max-w-xs">
            Minimum skip length (seconds)
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
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </button>
            {updateMutation.isSuccess && (
              <span className="text-sm text-green-300">Saved</span>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6">
        <h2 className="text-lg font-semibold">Skip categories</h2>
        <p className="text-sm text-muted">
          SponsorBlock segments tagged with the selected categories will be skipped.
        </p>
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
