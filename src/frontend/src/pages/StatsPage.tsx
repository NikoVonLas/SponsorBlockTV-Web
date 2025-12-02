import { useMemo, useState } from "react";
import { useStatsQuery } from "../api/hooks";
import { useTranslation } from "../i18n";

const GLOBAL_KEY = "__global__";

const metricKeys = [
  "videos_watched",
  "watch_time_seconds",
  "segments_skipped",
  "time_saved_seconds",
] as const;

const CATEGORY_COLORS = [
  "#ff4e8a",
  "#ffb347",
  "#6ddccf",
  "#7f8cff",
  "#c084fc",
  "#fb7185",
];

const formatDuration = (seconds: number): string => {
  if (!seconds) return "0s";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (!hrs && !mins) parts.push(`${secs}s`);
  return parts.join(" ");
};

const formatMetricValue = (key: string, value: number): string => {
  if (key.endsWith("_seconds")) {
    return formatDuration(value);
  }
  return value?.toLocaleString() ?? "0";
};

export const StatsPage = () => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useStatsQuery();
  const [selectedDevice, setSelectedDevice] = useState<string>(GLOBAL_KEY);

  const deviceOptions = data?.devices ?? [];
  const categoryEntries = Object.entries(data?.category_breakdown ?? {});

  const selectedMetrics = useMemo(() => {
    if (!data) return {};
    if (selectedDevice === GLOBAL_KEY) {
      return data.global_metrics ?? {};
    }
    const device = deviceOptions.find((d) => d.screen_id === selectedDevice);
    return device?.metrics ?? {};
  }, [data, deviceOptions, selectedDevice]);

  if (isLoading) {
    return <p className="text-muted">{t("stats.loading")}</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error.message || t("common.requestFailed")}
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted">{t("stats.empty")}</p>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("stats.title")}</h1>
        <p className="text-muted mt-1">{t("stats.subtitle")}</p>
      </header>

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">{t("stats.perDevice")}</h2>
          <label className="text-sm flex items-center gap-2">
            <span className="text-muted">{t("stats.deviceFilter")}</span>
            <select
              className="rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={selectedDevice}
              onChange={(event) => setSelectedDevice(event.target.value)}
            >
              <option value={GLOBAL_KEY}>{t("stats.allDevices")}</option>
              {deviceOptions.map((device) => (
                <option key={device.screen_id} value={device.screen_id}>
                  {device.name || device.screen_id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricKeys.map((key) => (
            <div key={key} className="rounded-xl border border-border p-4">
              <p className="text-sm text-muted">{t(`stats.metrics.${key}`)}</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatMetricValue(key, selectedMetrics[key] ?? 0)}
              </p>
            </div>
          ))}
        </div>
        {selectedDevice === GLOBAL_KEY && deviceOptions.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-200 text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">{t("stats.deviceColumn")}</th>
                  {metricKeys.map((key) => (
                    <th key={key} className="px-4 py-2 text-left">
                      {t(`stats.metrics.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deviceOptions.map((device) => (
                  <tr key={device.screen_id} className="border-t border-border">
                    <td className="px-4 py-2 flex items-center gap-3">
                      <StatusBadge
                        online={device.online}
                        labelOnline={t("stats.online")}
                        labelOffline={t("stats.offline")}
                      />
                      <span className="flex flex-col">
                        <span className="font-medium leading-tight">
                          {device.name || device.screen_id}
                        </span>
                        <span className="text-xs font-mono text-muted leading-tight">
                          {device.screen_id}
                        </span>
                      </span>
                    </td>
                    {metricKeys.map((key) => (
                      <td key={key} className="px-4 py-2">
                        {formatMetricValue(key, device.metrics?.[key] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedDevice === GLOBAL_KEY && (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
            <div className="flex flex-col items-center gap-4">
              {categoryEntries.length ? (
                <div
                  className="h-48 w-48 rounded-full border border-border"
                  style={{ background: buildCategoryGradient(categoryEntries) }}
                />
              ) : (
                <div className="h-48 w-48 rounded-full border border-dashed border-border flex items-center justify-center text-sm text-muted">
                  {t("stats.noCategories")}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-md font-semibold mb-2">{t("stats.categoryBreakdown")}</h3>
              {categoryEntries.length ? (
                <ul className="space-y-2">
                  {categoryEntries.map(([category, count], index) => (
                    <li key={category} className="flex items-center gap-3 text-sm">
                      <span
                        className="block h-3 w-3 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                      />
                      <span className="flex-1 text-muted">
                        {category} — {t("stats.metrics.segments_skipped")}:
                      </span>
                      <span className="font-semibold">{count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("stats.noCategories")}</p>
              )}
            </div>
          </div>
        )}
      </section>

    </div>
  );
};

export default StatsPage;

const StatusBadge = ({
  online,
  labelOnline,
  labelOffline,
}: {
  online: boolean;
  labelOnline: string;
  labelOffline: string;
}) => (
  <span
    className={
      online
        ? "inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400"
        : "inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
    }
  >
    <span className={online ? "h-2 w-2 rounded-full bg-green-400" : "h-2 w-2 rounded-full bg-red-400"} />
    {online ? labelOnline : labelOffline}
  </span>
);

const buildCategoryGradient = (entries: [string, number][]) => {
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) {
    return "#1f2233";
  }
  let current = 0;
  const segments = entries.map(([_, value], index) => {
    const start = (current / total) * 100;
    current += value;
    const end = (current / total) * 100;
    const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    return `${color} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
};
