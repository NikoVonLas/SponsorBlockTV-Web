import { useState } from "react";
import type { FormEvent } from "react";
import {
  useAddDeviceMutation,
  useDeleteDeviceMutation,
  useDevicesQuery,
  useDiscoverDevicesMutation,
  usePairDeviceMutation,
  useUpdateDeviceMutation,
} from "../api/hooks";
import type { DeviceModel } from "../api/types";
import { useTranslation } from "../i18n";

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

export const DevicesPage = () => {
  const { data: devices, isLoading, error } = useDevicesQuery();
  const addDevice = useAddDeviceMutation();
  const updateDevice = useUpdateDeviceMutation();
  const deleteDevice = useDeleteDeviceMutation();
  const pairDevice = usePairDeviceMutation();
  const discoverDevices = useDiscoverDevicesMutation();

  const [newDevice, setNewDevice] = useState<DeviceFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DeviceFormState>(emptyForm);
  const [pairCode, setPairCode] = useState("");
  const [pairName, setPairName] = useState("");
  const { t } = useTranslation();

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addDevice.mutate(
      { ...newDevice, offset: Number(newDevice.offset) },
      {
        onSuccess: () => setNewDevice(emptyForm),
      },
    );
  };

  const startEdit = (device: DeviceModel) => {
    setEditingId(device.screen_id);
    setEditForm({
      screen_id: device.screen_id,
      name: device.name,
      offset: device.offset,
    });
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    updateDevice.mutate(
      {
        screenId: editingId,
        payload: {
          screen_id: editForm.screen_id,
          name: editForm.name,
          offset: Number(editForm.offset),
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
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

  return (
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
          <h2 className="text-lg font-semibold">{t("devices.addSection.title")}</h2>
          <p className="text-sm text-muted">{t("devices.addSection.description")}</p>
        </div>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={handleAdd}>
          <label className="text-sm font-medium md:col-span-1">
            {t("devices.addSection.screenId")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={newDevice.screen_id}
              onChange={(event) =>
                setNewDevice((prev) => ({ ...prev, screen_id: event.target.value }))
              }
              required
            />
          </label>
          <label className="text-sm font-medium md:col-span-1">
            {t("devices.addSection.name")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={newDevice.name}
              onChange={(event) =>
                setNewDevice((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <label className="text-sm font-medium md:col-span-1">
            {t("devices.addSection.offset")}
            <input
              type="number"
              min={0}
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={newDevice.offset}
              onChange={(event) =>
                setNewDevice((prev) => ({
                  ...prev,
                  offset: Number(event.target.value),
                }))
              }
            />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
              disabled={addDevice.isPending}
            >
              {addDevice.isPending
                ? t("devices.addSection.submitting")
                : t("devices.addSection.submit")}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t("devices.pairSection.title")}</h2>
          <p className="text-sm text-muted">{t("devices.pairSection.description")}</p>
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handlePair}>
          <label className="text-sm font-medium">
            {t("devices.pairSection.pairingCode")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
              placeholder={t("devices.pairSection.pairingPlaceholder")}
              required
            />
          </label>
          <label className="text-sm font-medium">
            {t("devices.pairSection.optionalName")}
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
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
                      onClick={() => startEdit(device)}
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

        {editingId && (
          <form
            className="rounded-xl border border-border bg-surface-200 p-4 space-y-4"
            onSubmit={submitEdit}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {t("devices.editSection.title", { id: editingId ?? "" })}
              </p>
              <button
                type="button"
                className="text-sm text-muted hover:text-fg"
                onClick={() => setEditingId(null)}
              >
                {t("devices.editSection.cancel")}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium">
                {t("devices.addSection.screenId")}
                <input
                  className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
                  value={editForm.screen_id}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, screen_id: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="text-sm font-medium">
                {t("devices.addSection.name")}
                <input
                  className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="text-sm font-medium">
                {t("devices.addSection.offset")}
                <input
                  type="number"
                  min={0}
                  className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
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
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
              disabled={updateDevice.isPending}
            >
              {updateDevice.isPending
                ? t("devices.editSection.submitting")
                : t("devices.editSection.submit")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
