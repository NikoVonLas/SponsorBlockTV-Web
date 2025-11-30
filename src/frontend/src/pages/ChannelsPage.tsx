import { useState } from "react";
import type { FormEvent } from "react";
import {
  useAddChannelMutation,
  useChannelSearchMutation,
  useChannelsQuery,
  useDeleteChannelMutation,
} from "../api/hooks";

export const ChannelsPage = () => {
  const { data: channels, isLoading, error } = useChannelsQuery();
  const addChannel = useAddChannelMutation();
  const deleteChannel = useDeleteChannelMutation();
  const searchChannels = useChannelSearchMutation();

  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newChannelId) return;
    addChannel.mutate(
      { channel_id: newChannelId, name: newChannelName || undefined },
      {
        onSuccess: () => {
          setNewChannelId("");
          setNewChannelName("");
        },
      },
    );
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    searchChannels.mutate(searchQuery.trim());
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Channel whitelist</h1>
        <p className="text-muted mt-1">
          Restrict automation to trusted uploaders or quickly add new channels via YouTube API
          search.
        </p>
      </header>

      {(error || addChannel.error || deleteChannel.error) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error?.message ||
            addChannel.error?.message ||
            deleteChannel.error?.message ||
            "Channel request failed."}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Add channel manually</h2>
          <p className="text-sm text-muted">Paste the channel ID from YouTube Studio.</p>
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleAdd}>
          <label className="text-sm font-medium">
            Channel ID
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={newChannelId}
              onChange={(event) => setNewChannelId(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Friendly name
            <input
              className="mt-2 w-full rounded-lg border border-border bg-canvas px-3 py-2"
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
              disabled={addChannel.isPending}
            >
              {addChannel.isPending ? "Saving…" : "Add channel"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Search YouTube</h2>
          <p className="text-sm text-muted">
            Requires a YouTube Data API key configured under <strong>Config → Identity</strong>.
          </p>
        </div>
        <form className="flex flex-col gap-4 md:flex-row" onSubmit={handleSearch}>
          <input
            className="flex-1 rounded-lg border border-border bg-canvas px-3 py-2"
            placeholder="Search for channels"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2 font-semibold hover:bg-surface-200 disabled:opacity-60"
            disabled={searchChannels.isPending}
          >
            {searchChannels.isPending ? "Searching…" : "Search"}
          </button>
        </form>
        {searchChannels.error && (
          <p className="text-sm text-red-400">{searchChannels.error.message}</p>
        )}
        {searchChannels.data && (
          <div className="rounded-xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-200 text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Subscribers</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {searchChannels.data.map((channel) => (
                  <tr key={channel.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{channel.name}</p>
                      <p className="text-xs text-muted">{channel.id}</p>
                    </td>
                    <td className="px-4 py-3">{channel.subscriber_count}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-sm text-accent hover:underline"
                        onClick={() =>
                          addChannel.mutate({
                            channel_id: channel.id,
                            name: channel.name,
                          })
                        }
                        disabled={addChannel.isPending}
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface-100 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Whitelisted channels</h2>
            <p className="text-sm text-muted">
              {isLoading
                ? "Loading channels…"
                : `${channels?.length ?? 0} whitelisted channel(s).`}
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-200 text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Channel ID</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(channels ?? []).map((channel) => (
                <tr key={channel.id} className="border-t border-border">
                  <td className="px-4 py-3">{channel.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{channel.id}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-sm text-red-400 hover:underline"
                      onClick={() => deleteChannel.mutate(channel.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!channels?.length && !isLoading && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={3}>
                    No channels are currently whitelisted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
