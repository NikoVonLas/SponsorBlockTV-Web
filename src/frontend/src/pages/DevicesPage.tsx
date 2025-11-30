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
        <h1 className="text-2xl font-semibold">Devices</h1>
        <p className="text-muted mt-1">
          Register lounge screens, tweak offsets, and make sure every TV stays paired.
        </p>
      </header>

      {(error || addDevice.error || updateDevice.error || deleteDevice.error) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error?.message ||
            addDevice.error?.message ||
            updateDevice.error?.message ||
            deleteDevice.error?.message ||
            "Device request failed."}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Add device manually</h2>
          <p className="text-sm text-muted">
            Provide the lounge screen identifier from your YouTube client.
          </p>
        </div>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={handleAdd}>
          <label className="text-sm font-medium md:col-span-1">
            Screen ID
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
            Name
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={newDevice.name}
              onChange={(event) =>
                setNewDevice((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <label className="text-sm font-medium md:col-span-1">
            Offset (seconds)
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
              {addDevice.isPending ? "Adding…" : "Add device"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Pair from PIN</h2>
          <p className="text-sm text-muted">
            Enter the 12-digit pairing code displayed on your YouTube TV app.
          </p>
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handlePair}>
          <label className="text-sm font-medium">
            Pairing code
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
              placeholder="1234 5678 9012"
              required
            />
          </label>
          <label className="text-sm font-medium">
            Optional name
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
              {pairDevice.isPending ? "Pairing…" : "Pair device"}
            </button>
            {pairDevice.error && (
              <p className="mt-2 text-sm text-red-400">{pairDevice.error.message}</p>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Registered devices</h2>
            <p className="text-sm text-muted">
              {isLoading ? "Loading devices…" : `${devices?.length ?? 0} device(s) configured.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => discoverDevices.mutate()}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-200"
            disabled={discoverDevices.isPending}
          >
            {discoverDevices.isPending ? "Scanning…" : "Discover on network"}
          </button>
        </div>

        {discoverDevices.data && discoverDevices.data.length > 0 && (
          <div className="rounded-lg border border-border p-4 text-sm text-muted">
            <p className="font-medium text-fg">Discovered screens</p>
            <ul className="mt-2 space-y-1">
              {discoverDevices.data.map((device) => (
                <li key={device.screen_id}>
                  {device.name} · <span className="text-muted">ID:</span> {device.screen_id}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-200 text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Screen ID</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Offset (s)</th>
                <th className="px-4 py-2 font-medium">Actions</th>
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
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-400 hover:underline"
                      onClick={() => deleteDevice.mutate(device.screen_id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!devices?.length && !isLoading && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={4}>
                    No devices have been registered yet.
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
                Editing <span className="text-accent">{editingId}</span>
              </p>
              <button
                type="button"
                className="text-sm text-muted hover:text-fg"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium">
                Screen ID
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
                Name
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
                Offset (seconds)
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
              {updateDevice.isPending ? "Saving…" : "Save device"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
