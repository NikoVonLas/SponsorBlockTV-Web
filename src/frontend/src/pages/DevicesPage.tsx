import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { FormEvent } from "react";
import {
  useConfigQuery,
  useAddDeviceMutation,
  useChannelSearchMutation,
  useDeleteDeviceMutation,
  useDevicesQuery,
  useDiscoverDevicesMutation,
  usePairDeviceMutation,
  useSkipCategoryOptions,
  useUpdateDeviceMutation,
} from "../api/hooks";
import type {
  AutomationOverrideKey,
  ChannelModel,
  DeviceModel,
  DeviceOverrides,
  DeviceOverridesUpdate,
  DeviceOverridesUpdatePayload,
  DeviceUpdateRequest,
} from "../api/types";
import { useTranslation, type TranslationKey } from "../i18n";
import { Modal } from "../components/Modal";

type DeviceFormState = {
  screen_id: string;
  name: string;
  offset: number;
};

const emptyForm: DeviceFormState = {
  screen_id: "",
  name: "",
  offset: 0,
};

const automationFieldConfigs: {
  key: AutomationOverrideKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}[] = [
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
];

const automationKeys = automationFieldConfigs.map((field) => field.key);

const normalizeChannelEntry = (entry: ChannelModel): ChannelModel => {
  const id = entry.id.trim();
  const name = entry.name.trim();
  return {
    id,
    name: name || id,
  };
};

const dedupeChannels = (entries: ChannelModel[]): ChannelModel[] => {
  const seen = new Set<string>();
  const result: ChannelModel[] = [];
  entries.forEach((entry) => {
    const normalized = normalizeChannelEntry(entry);
    if (!normalized.id || seen.has(normalized.id)) {
      return;
    }
    seen.add(normalized.id);
    result.push(normalized);
  });
  return result;
};

const areStringArraysEqual = (
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const areChannelListsEqual = (
  a: ChannelModel[] | null | undefined,
  b: ChannelModel[] | null | undefined,
): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every(
    (entry, index) => entry.id === b[index]?.id && entry.name === b[index]?.name,
  );
};

type AutomationSelectValue = "inherit" | "true" | "false";

const addEntryToList = (
  entry: ChannelModel,
  updater: Dispatch<SetStateAction<ChannelModel[] | null>>,
) => {
  updater((prev) => dedupeChannels([...(prev ?? []), entry]));
};

export const DevicesPage = () => {
  const { data: config } = useConfigQuery();
  const { data: skipCategoryOptions } = useSkipCategoryOptions();
  const { data: devices, isLoading, error } = useDevicesQuery();
  const addDevice = useAddDeviceMutation();
  const updateDevice = useUpdateDeviceMutation();
  const deleteDevice = useDeleteDeviceMutation();
  const pairDevice = usePairDeviceMutation();
  const discoverDevices = useDiscoverDevicesMutation();

  const [newDevice, setNewDevice] = useState<DeviceFormState>(emptyForm);
  const [editForm, setEditForm] = useState<DeviceFormState>(emptyForm);
  const [pairCode, setPairCode] = useState("");
  const [pairName, setPairName] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceModel | null>(null);
  const [initialOverrides, setInitialOverrides] = useState<DeviceOverrides | null>(null);
  const [automationOverrides, setAutomationOverrides] = useState<
    Record<AutomationOverrideKey, boolean | null>
  >({
    skip_ads: null,
    mute_ads: null,
    skip_count_tracking: null,
    auto_play: null,
  });
  const [customSkipCategories, setCustomSkipCategories] = useState<string[] | null>(null);
  const [customWhitelist, setCustomWhitelist] = useState<ChannelModel[] | null>(null);
  const [newWhitelistId, setNewWhitelistId] = useState("");
  const [newWhitelistName, setNewWhitelistName] = useState("");
  const [overrideSearchQuery, setOverrideSearchQuery] = useState("");
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const overrideSearch = useChannelSearchMutation();
  const { t } = useTranslation();
  const hasApiKey = Boolean(config?.apikey?.trim());

  useEffect(() => {
    if (!editingDevice) {
      setInitialOverrides(null);
      setAutomationOverrides({
        skip_ads: null,
        mute_ads: null,
        skip_count_tracking: null,
        auto_play: null,
      });
      setCustomSkipCategories(null);
      setCustomWhitelist(null);
      setNewWhitelistId("");
      setNewWhitelistName("");
      setOverridesError(null);
      setEditForm(emptyForm);
      return;
    }
    setEditForm({
      screen_id: editingDevice.screen_id,
      name: editingDevice.name,
      offset: editingDevice.offset,
    });
    const currentOverrides = editingDevice.overrides ?? null;
    setInitialOverrides(currentOverrides);
    setAutomationOverrides({
      skip_ads: currentOverrides?.automation?.skip_ads ?? null,
      mute_ads: currentOverrides?.automation?.mute_ads ?? null,
      skip_count_tracking: currentOverrides?.automation?.skip_count_tracking ?? null,
      auto_play: currentOverrides?.automation?.auto_play ?? null,
    });
    setCustomSkipCategories(
      currentOverrides?.skip_categories ? [...currentOverrides.skip_categories] : null,
    );
    setCustomWhitelist(
      currentOverrides?.channel_whitelist ? [...currentOverrides.channel_whitelist] : null,
    );
    setNewWhitelistId("");
    setNewWhitelistName("");
    setOverridesError(null);
  }, [editingDevice]);

  const openEditModal = (device: DeviceModel) => {
    setEditingDevice(device);
  };

  const closeEditModal = () => {
    setEditingDevice(null);
  };

  const handleAutomationSelect = (
    key: AutomationOverrideKey,
    value: AutomationSelectValue,
  ) => {
    setAutomationOverrides((prev) => ({
      ...prev,
      [key]: value === "inherit" ? null : value === "true",
    }));
  };

  const enableCategoryOverrides = () => {
    if (customSkipCategories !== null) {
      return;
    }
    if (editingDevice?.overrides?.skip_categories) {
      setCustomSkipCategories([...editingDevice.overrides.skip_categories]);
      return;
    }
    if (config?.skip_categories) {
      setCustomSkipCategories([...config.skip_categories]);
      return;
    }
    setCustomSkipCategories([]);
  };

  const resetCategoryOverrides = () => {
    setCustomSkipCategories(null);
  };

  const toggleCustomCategory = (value: string) => {
    setCustomSkipCategories((prev) => {
      if (prev === null) {
        return prev;
      }
      if (prev.includes(value)) {
        return prev.filter((category) => category !== value);
      }
      return [...prev, value];
    });
  };

  const enableWhitelistOverrides = () => {
    if (customWhitelist !== null) {
      return;
    }
    const source =
      editingDevice?.overrides?.channel_whitelist ??
      config?.channel_whitelist ??
      [];
    setCustomWhitelist(dedupeChannels(source));
  };

  const resetWhitelistOverrides = () => {
    setCustomWhitelist(null);
  };

  const handleAddWhitelistEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (customWhitelist === null) {
      return;
    }
    const id = newWhitelistId.trim();
    if (!id) {
      return;
    }
    const name = newWhitelistName.trim() || id;
    addEntryToList({ id, name }, setCustomWhitelist);
    setNewWhitelistId("");
    setNewWhitelistName("");
  };

  const handleRemoveWhitelistEntry = (channelId: string) => {
    setCustomWhitelist((prev) =>
      prev ? prev.filter((channel) => channel.id !== channelId) : prev,
    );
  };

  const describeCategories = (values: string[] | null | undefined): string => {
    if (!values || values.length === 0) {
      return t("devices.overrides.none");
    }
    return values
      .map(
        (value) =>
          skipCategoryOptions?.find((option) => option.value === value)?.label ?? value,
      )
      .join(", ");
  };

  const handleOverrideSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = overrideSearchQuery.trim();
    if (!query) {
      return;
    }
    overrideSearch.mutate(query);
  };

  const buildOverridesPayload = (): DeviceOverridesUpdate | undefined => {
    if (!editingDevice) {
      return undefined;
    }
    const original = initialOverrides;
    const automationEntries: Partial<Record<AutomationOverrideKey, boolean | null>> =
      {};
    automationKeys.forEach((key) => {
      const value = automationOverrides[key];
      if (value === true || value === false) {
        automationEntries[key] = value;
      } else if (original?.automation && key in original.automation) {
        automationEntries[key] = null;
      }
    });
    let automationPatch: DeviceOverridesUpdatePayload["automation"] | undefined;
    if (Object.keys(automationEntries).length > 0) {
      const allNull = Object.values(automationEntries).every((entry) => entry === null);
      automationPatch = allNull ? null : automationEntries;
    }

    let skipPatch: string[] | null | undefined;
    if (customSkipCategories === null) {
      if (original?.skip_categories) {
        skipPatch = null;
      }
    } else if (!areStringArraysEqual(customSkipCategories, original?.skip_categories ?? null)) {
      skipPatch = [...customSkipCategories];
    }

    let whitelistPatch: ChannelModel[] | null | undefined;
    if (customWhitelist === null) {
      if (original?.channel_whitelist) {
        whitelistPatch = null;
      }
    } else if (!areChannelListsEqual(customWhitelist, original?.channel_whitelist ?? null)) {
      whitelistPatch = dedupeChannels(customWhitelist);
    }

    const hasAnyCustom =
      automationKeys.some((key) => automationOverrides[key] !== null) ||
      customSkipCategories !== null ||
      customWhitelist !== null;
    const hadOriginal =
      Boolean(
        original &&
          ((original.automation && Object.keys(original.automation).length > 0) ||
            (original.skip_categories && original.skip_categories.length > 0) ||
            (original.channel_whitelist && original.channel_whitelist.length > 0)),
      );

    if (
      automationPatch === undefined &&
      skipPatch === undefined &&
      whitelistPatch === undefined
    ) {
      if (!hasAnyCustom && hadOriginal) {
        return null;
      }
      return undefined;
    }

    const payload: DeviceOverridesUpdatePayload = {};
    if (automationPatch !== undefined) {
      payload.automation = automationPatch;
    }
    if (skipPatch !== undefined) {
      payload.skip_categories = skipPatch;
    }
    if (whitelistPatch !== undefined) {
      payload.channel_whitelist = whitelistPatch;
    }

    if (Object.keys(payload).length === 0 && !hasAnyCustom && hadOriginal) {
      return null;
    }

    return payload;
  };

  const handleEditSave = async () => {
    if (!editingDevice) {
      return;
    }
    const trimmedScreenId = editForm.screen_id.trim();
    const trimmedName = editForm.name.trim() || trimmedScreenId;
    const normalizedOffset = Number(editForm.offset) || 0;

    const overridesPayload = buildOverridesPayload();

    const payload: DeviceUpdateRequest = {
      screen_id: trimmedScreenId || editingDevice.screen_id,
      name: trimmedName || editingDevice.name,
      offset: normalizedOffset,
    };
    if (overridesPayload !== undefined) {
      payload.overrides = overridesPayload;
    }

    setOverridesError(null);
    try {
      await updateDevice.mutateAsync({
        screenId: editingDevice.screen_id,
        payload,
      });
      setEditingDevice(null);
    } catch (mutationError) {
      setOverridesError(
        mutationError instanceof Error ? mutationError.message : t("common.requestFailed"),
      );
    }
  };

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addDevice.mutate(
      { ...newDevice, offset: Number(newDevice.offset) },
      {
        onSuccess: () => {
          setNewDevice(emptyForm);
          setIsAddModalOpen(false);
        },
      },
    );
  };

  const handlePair = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pairDevice.mutate(
      { pairing_code: pairCode, name: pairName || undefined },
      {
        onSuccess: () => {
          setPairCode("");
          setPairName("");
        },
      },
    );
  };

  const formatPairingCode = (value: string) =>
    value.replace(/\D/g, "").replace(/(.{3})/g, "$1 ").trim();

  return (
    <>
      <div className="space-y-10">
        <header>
          <h1 className="text-2xl font-semibold">{t("devices.title")}</h1>
        <p className="text-muted mt-1">{t("devices.subtitle")}</p>
      </header>

      {(error || addDevice.error || updateDevice.error || deleteDevice.error) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error?.message ||
            addDevice.error?.message ||
            updateDevice.error?.message ||
            deleteDevice.error?.message ||
            t("devices.error")}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t("devices.pairSection.title")}</h2>
          <p className="text-sm text-muted">{t("devices.pairSection.description")}</p>
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handlePair}>
          <label className="text-sm font-medium">
            {t("devices.pairSection.pairingCode")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={formatPairingCode(pairCode)}
              onChange={(event) =>
                setPairCode(event.target.value.replace(/\D/g, "").slice(0, 12))
              }
              placeholder={t("devices.pairSection.pairingPlaceholder")}
              required
            />
          </label>
          <label className="text-sm font-medium">
            {t("devices.pairSection.optionalName")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
              value={pairName}
              onChange={(event) => setPairName(event.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
              disabled={pairDevice.isPending}
            >
              {pairDevice.isPending
                ? t("devices.pairSection.submitting")
                : t("devices.pairSection.submit")}
            </button>
            {pairDevice.error && (
              <p className="mt-2 text-sm text-red-400">
                {pairDevice.error.message || t("common.requestFailed")}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("devices.registered.title")}</h2>
            <p className="text-sm text-muted">
              {isLoading
                ? t("devices.registered.loading")
                : t("devices.registered.count", { count: devices?.length ?? 0 })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {t("devices.addSection.submit")}
            </button>
            <button
              type="button"
              onClick={() => discoverDevices.mutate()}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-200"
              disabled={discoverDevices.isPending}
            >
              {discoverDevices.isPending
                ? t("devices.registered.discoverPending")
                : t("devices.registered.discoverIdle")}
            </button>
          </div>
        </div>

        {discoverDevices.data && discoverDevices.data.length > 0 && (
          <div className="rounded-lg border border-border p-4 text-sm text-muted">
            <p className="font-medium text-fg">{t("devices.registered.discoveredHeading")}</p>
            <ul className="mt-2 space-y-1">
              {discoverDevices.data.map((device) => (
                <li key={device.screen_id}>
                  {device.name} ·{" "}
                  <span className="text-muted">{t("devices.registered.discoveredIdLabel")}</span>{" "}
                  {device.screen_id}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-200 text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t("devices.table.screenId")}</th>
                <th className="px-4 py-2 font-medium">{t("devices.table.name")}</th>
                <th className="px-4 py-2 font-medium">{t("devices.table.offset")}</th>
                <th className="px-4 py-2 font-medium">{t("devices.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(devices ?? []).map((device) => (
                <tr key={device.screen_id} className="border-t border-border">
                  <td className="px-4 py-3">{device.screen_id}</td>
                  <td className="px-4 py-3">{device.name}</td>
                  <td className="px-4 py-3">{device.offset}</td>
                  <td className="px-4 py-3 space-x-3">
                    <button
                      type="button"
                      className="text-sm text-accent hover:underline"
                      onClick={() => openEditModal(device)}
                    >
                      {t("devices.table.edit")}
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-400 hover:underline"
                      onClick={() => deleteDevice.mutate(device.screen_id)}
                    >
                      {t("devices.table.remove")}
                    </button>
                  </td>
                </tr>
              ))}
              {!devices?.length && !isLoading && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={4}>
                    {t("devices.table.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>

      {editingDevice && (
        <Modal
          title={t("devices.overrides.title", { name: editingDevice.name })}
          onClose={closeEditModal}
          closeLabel={t("common.close")}
        >
          {overridesError && (
            <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {overridesError}
            </p>
          )}
          <div className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">
                  {t("devices.overrides.general.title")}
                </h3>
                <p className="text-sm text-muted">
                  {t("devices.overrides.general.description")}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-medium">
                  {t("devices.overrides.general.screenId")}
                  <input
                    className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                    value={editForm.screen_id}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, screen_id: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="text-sm font-medium">
                  {t("devices.overrides.general.name")}
                  <input
                    className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="text-sm font-medium">
                  {t("devices.overrides.general.offset")}
                  <input
                    type="number"
                    min={0}
                    className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                    value={editForm.offset}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        offset: Number(event.target.value),
                      }))
                    }
                    required
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">
                  {t("devices.overrides.automation.title")}
                </h3>
                <p className="text-sm text-muted">
                  {t("devices.overrides.automation.description")}
                </p>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {automationFieldConfigs.map((field) => {
                  const globalValue = config ? Boolean(config[field.key]) : false;
                  const value = automationOverrides[field.key];
                  const selectValue: AutomationSelectValue =
                    value === null ? "inherit" : value ? "true" : "false";
                  return (
                    <label
                      key={field.key}
                      className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-medium">{t(field.labelKey)}</p>
                        <p className="text-xs text-muted">{t(field.descriptionKey)}</p>
                      </div>
                      <select
                        className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/60"
                        value={selectValue}
                        onChange={(event) =>
                          handleAutomationSelect(field.key, event.target.value as AutomationSelectValue)
                        }
                      >
                        <option value="inherit">
                          {t("devices.overrides.automation.inherit", {
                            value: globalValue
                              ? t("devices.overrides.optionEnabled")
                              : t("devices.overrides.optionDisabled"),
                          })}
                        </option>
                        <option value="true">{t("devices.overrides.optionEnabled")}</option>
                        <option value="false">{t("devices.overrides.optionDisabled")}</option>
                      </select>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">
                    {t("devices.overrides.skipCategories.title")}
                  </h3>
                  <p className="text-sm text-muted">
                    {customSkipCategories === null
                      ? t("devices.overrides.skipCategories.usingGlobal", {
                          categories: describeCategories(config?.skip_categories ?? []),
                        })
                      : t("devices.overrides.skipCategories.customDescription")}
                  </p>
                </div>
                {customSkipCategories === null ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-200"
                    onClick={enableCategoryOverrides}
                  >
                    {t("devices.overrides.skipCategories.enable")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-200"
                    onClick={resetCategoryOverrides}
                  >
                    {t("devices.overrides.skipCategories.disable")}
                  </button>
                )}
              </div>
              {customSkipCategories !== null && (
                <div className="grid gap-3 md:grid-cols-2">
                  {(skipCategoryOptions ?? []).map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-accent"
                        checked={customSkipCategories.includes(option.value)}
                        onChange={() => toggleCustomCategory(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">
                    {t("devices.overrides.whitelist.title")}
                  </h3>
                  <p className="text-sm text-muted">
                    {customWhitelist === null
                      ? t("devices.overrides.whitelist.usingGlobal", {
                          count: config?.channel_whitelist?.length ?? 0,
                        })
                      : t("devices.overrides.whitelist.customDescription")}
                  </p>
                </div>
                {customWhitelist === null ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-200"
                    onClick={enableWhitelistOverrides}
                  >
                    {t("devices.overrides.whitelist.enable")}
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-200"
                      onClick={resetWhitelistOverrides}
                    >
                      {t("devices.overrides.whitelist.disable")}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-200"
                      onClick={() =>
                        setCustomWhitelist(
                          dedupeChannels(config?.channel_whitelist ?? customWhitelist ?? []),
                        )
                      }
                    >
                      {t("devices.overrides.whitelist.importGlobal")}
                    </button>
                  </div>
                )}
              </div>
              {customWhitelist !== null && (
                <>
                  {customWhitelist.length === 0 ? (
                    <p className="text-sm text-muted">
                      {t("devices.overrides.whitelist.empty")}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {customWhitelist.map((channel) => (
                        <li
                          key={channel.id}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                        >
                          <div>
                            <p className="font-medium">{channel.name}</p>
                            <p className="text-xs text-muted font-mono">{channel.id}</p>
                          </div>
                          <button
                            type="button"
                            className="text-sm text-red-400 hover:underline"
                            onClick={() => handleRemoveWhitelistEntry(channel.id)}
                          >
                            {t("common.remove")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form
                    className="grid gap-3 md:grid-cols-2"
                    onSubmit={handleAddWhitelistEntry}
                  >
                    <label className="text-sm font-medium">
                      {t("devices.overrides.whitelist.channelId")}
                      <input
                        className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                        value={newWhitelistId}
                        onChange={(event) => setNewWhitelistId(event.target.value)}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium">
                      {t("devices.overrides.whitelist.channelName")}
                      <input
                        className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                        value={newWhitelistName}
                        onChange={(event) => setNewWhitelistName(event.target.value)}
                      />
                    </label>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
                        disabled={!newWhitelistId.trim()}
                      >
                        {t("devices.overrides.whitelist.addManual")}
                      </button>
                    </div>
                  </form>
                  {hasApiKey ? (
                    <div className="space-y-3 rounded-xl border border-border p-4">
                      <div>
                        <p className="font-medium">
                          {t("devices.overrides.whitelist.search.title")}
                        </p>
                        <p className="text-sm text-muted">
                          {t("devices.overrides.whitelist.search.description")}
                        </p>
                      </div>
                      <form
                        className="flex flex-col gap-3 md:flex-row"
                        onSubmit={handleOverrideSearch}
                      >
                        <input
                          className="flex-1 rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                          placeholder={t("devices.overrides.whitelist.search.placeholder")}
                          value={overrideSearchQuery}
                          onChange={(event) => setOverrideSearchQuery(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-border px-4 py-2 font-semibold hover:bg-surface-200 disabled:opacity-60"
                          disabled={overrideSearch.isPending}
                        >
                          {overrideSearch.isPending
                            ? t("devices.overrides.whitelist.search.submitting")
                            : t("devices.overrides.whitelist.search.submit")}
                        </button>
                      </form>
                      {overrideSearch.error && (
                        <p className="text-sm text-red-400">
                          {overrideSearch.error.message || t("common.requestFailed")}
                        </p>
                      )}
                      {overrideSearch.data &&
                        (overrideSearch.data.length > 0 ? (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="min-w-full text-left text-sm">
                              <thead className="bg-surface-200 text-muted">
                                <tr>
                                  <th className="px-4 py-2 font-medium">
                                    {t("channels.search.table.name")}
                                  </th>
                                  <th className="px-4 py-2 font-medium">
                                    {t("channels.search.table.subscribers")}
                                  </th>
                                  <th className="px-4 py-2 font-medium">
                                    {t("channels.search.table.actions")}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {overrideSearch.data.map((channel) => (
                                  <tr key={channel.id} className="border-t border-border">
                                    <td className="px-4 py-3">
                                      <p className="font-medium">{channel.name}</p>
                                      <p className="text-xs text-muted font-mono">
                                        {channel.id}
                                      </p>
                                    </td>
                                    <td className="px-4 py-3">{channel.subscriber_count}</td>
                                    <td className="px-4 py-3">
                                      <button
                                        type="button"
                                        className="text-sm text-accent hover:underline"
                                        onClick={() =>
                                          addEntryToList(
                                            { id: channel.id, name: channel.name },
                                            setCustomWhitelist,
                                          )
                                        }
                                      >
                                        {t("devices.overrides.whitelist.search.add")}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted">
                            {t("devices.overrides.whitelist.search.empty")}
                          </p>
                        ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-muted">
                      {t("devices.overrides.whitelist.apiKeyMissing")}
                    </p>
                  )}
                </>
              )}
            </section>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-200"
                onClick={closeEditModal}
                disabled={updateDevice.isPending}
              >
                {t("devices.overrides.actions.cancel")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
                onClick={handleEditSave}
                disabled={updateDevice.isPending}
              >
                {updateDevice.isPending
                  ? t("devices.overrides.actions.saving")
                  : t("devices.overrides.actions.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {isAddModalOpen && (
        <Modal
          title={t("devices.addSection.title")}
          onClose={() => setIsAddModalOpen(false)}
          closeLabel={t("common.close")}
        >
          <p className="text-sm text-muted">{t("devices.addSection.description")}</p>
          <form className="mt-4 space-y-4" onSubmit={handleAdd}>
            <label className="text-sm font-medium">
              {t("devices.addSection.screenId")}
              <input
                className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                value={newDevice.screen_id}
                onChange={(event) =>
                  setNewDevice((prev) => ({ ...prev, screen_id: event.target.value }))
                }
                required
              />
            </label>
            <label className="text-sm font-medium">
              {t("devices.addSection.name")}
              <input
                className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                value={newDevice.name}
                onChange={(event) =>
                  setNewDevice((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </label>
            <label className="text-sm font-medium">
              {t("devices.addSection.offset")}
              <input
                type="number"
                min={0}
                className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
                value={newDevice.offset}
                onChange={(event) =>
                  setNewDevice((prev) => ({
                    ...prev,
                    offset: Number(event.target.value),
                  }))
                }
              />
            </label>
            <div className="pt-2">
              <button
                type="submit"
                className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
                disabled={addDevice.isPending}
              >
                {addDevice.isPending
                  ? t("devices.addSection.submitting")
                  : t("devices.addSection.submit")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
};
