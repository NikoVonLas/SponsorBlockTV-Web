import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, apiFetch } from "./client";
import type {
  ChannelAddRequest,
  ChannelModel,
  ChannelSearchResult,
  ConfigResponse,
  ConfigUpdateRequest,
  DeviceCreateRequest,
  DeviceModel,
  DeviceUpdateRequest,
  PairDeviceRequest,
  SkipCategoryOption,
  StatsResponse,
} from "./types";

const useAuthedRequest = () => {
  const { token, logout } = useAuth();
  return useCallback(
    async <T>(
      path: string,
      options?: RequestInit,
    ): Promise<T> => {
      try {
        return await apiFetch<T>(path, { ...options, token });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          logout();
        }
        throw error;
      }
    },
    [logout, token],
  );
};

export const useConfigQuery = () => {
  const request = useAuthedRequest();
  return useQuery<ConfigResponse, ApiError>({
    queryKey: ["config"],
    queryFn: () => request("/config"),
  });
};

export const useUpdateConfigMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<ConfigResponse, ApiError, ConfigUpdateRequest>({
    mutationFn: (payload) =>
      request("/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useSkipCategoryOptions = () => {
  const request = useAuthedRequest();
  return useQuery<SkipCategoryOption[], ApiError>({
    queryKey: ["skip-category-options"],
    queryFn: () => request("/skip-categories/options"),
    staleTime: Infinity,
  });
};

export const useDevicesQuery = () => {
  const request = useAuthedRequest();
  return useQuery<DeviceModel[], ApiError>({
    queryKey: ["devices"],
    queryFn: () => request("/devices"),
  });
};

export const useAddDeviceMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<DeviceModel, ApiError, DeviceCreateRequest>({
    mutationFn: (payload) =>
      request("/devices", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["devices"] });
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useUpdateDeviceMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<DeviceModel, ApiError, { screenId: string; payload: DeviceUpdateRequest }>({
    mutationFn: ({ screenId, payload }) =>
      request(`/devices/${encodeURIComponent(screenId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["devices"] });
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useDeleteDeviceMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (screenId) =>
      request(`/devices/${encodeURIComponent(screenId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["devices"] });
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useDiscoverDevicesMutation = () => {
  const request = useAuthedRequest();
  return useMutation<DeviceModel[], ApiError>({
    mutationFn: () => request("/devices/discover"),
  });
};

export const usePairDeviceMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<DeviceModel, ApiError, PairDeviceRequest>({
    mutationFn: (payload) =>
      request("/devices/pair", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["devices"] });
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useChannelsQuery = () => {
  const request = useAuthedRequest();
  return useQuery<ChannelModel[], ApiError>({
    queryKey: ["channels"],
    queryFn: () => request("/channels"),
  });
};

export const useAddChannelMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<ChannelModel, ApiError, ChannelAddRequest>({
    mutationFn: (payload) =>
      request("/channels", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["channels"] });
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useDeleteChannelMutation = () => {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (channelId) =>
      request(`/channels/${encodeURIComponent(channelId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["channels"] });
      client.invalidateQueries({ queryKey: ["config"] });
    },
  });
};

export const useChannelSearchMutation = (): UseMutationResult<
  ChannelSearchResult[],
  ApiError,
  string
> => {
  const request = useAuthedRequest();
  return useMutation<ChannelSearchResult[], ApiError, string>({
    mutationFn: (query) =>
      request(`/channels/search?query=${encodeURIComponent(query)}`),
  });
};

export const useStatsQuery = () => {
  const request = useAuthedRequest();
  return useQuery<StatsResponse, ApiError>({
    queryKey: ["stats"],
    queryFn: () => request("/stats"),
    refetchInterval: 30_000,
  });
};
