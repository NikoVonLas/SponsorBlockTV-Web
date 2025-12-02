export type AutomationOverrideKey =
  | "skip_ads"
  | "mute_ads"
  | "skip_count_tracking"
  | "auto_play";

export type DeviceAutomationOverrides = Partial<
  Record<AutomationOverrideKey, boolean>
>;

export type DeviceOverrides = {
  automation?: DeviceAutomationOverrides;
  skip_categories?: string[];
  channel_whitelist?: ChannelModel[];
};

export type DeviceOverridesUpdatePayload = {
  automation?: Partial<Record<AutomationOverrideKey, boolean | null>> | null;
  skip_categories?: string[] | null;
  channel_whitelist?: ChannelModel[] | null;
};

export type DeviceOverridesUpdate = DeviceOverridesUpdatePayload | null;

export type DeviceModel = {
  screen_id: string;
  name: string;
  offset: number;
  overrides?: DeviceOverrides | null;
};

export type ChannelModel = {
  id: string;
  name: string;
};

export type ConfigResponse = {
  devices: DeviceModel[];
  skip_categories: string[];
  skip_count_tracking: boolean;
  mute_ads: boolean;
  skip_ads: boolean;
  minimum_skip_length: number;
  auto_play: boolean;
  join_name: string;
  apikey: string;
  channel_whitelist: ChannelModel[];
  use_proxy: boolean;
};

export type ConfigUpdateRequest = Partial<{
  skip_categories: string[];
  skip_count_tracking: boolean;
  mute_ads: boolean;
  skip_ads: boolean;
  minimum_skip_length: number;
  auto_play: boolean;
  join_name: string;
  apikey: string;
  use_proxy: boolean;
}>;

export type SkipCategoryOption = {
  label: string;
  value: string;
};

export type DeviceCreateRequest = {
  screen_id: string;
  name?: string;
  offset?: number;
  overrides?: DeviceOverridesUpdate;
};

export type DeviceUpdateRequest = Partial<DeviceCreateRequest>;

export type PairDeviceRequest = {
  pairing_code: string;
  name?: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type ChannelAddRequest = {
  channel_id: string;
  name?: string;
};

export type ChannelSearchResult = {
  id: string;
  name: string;
  subscriber_count: string;
};

export type StatsMetrics = Record<string, number>;

export type DeviceStats = {
  screen_id: string;
  name: string;
  metrics: StatsMetrics;
  online: boolean;
};

export type StatsResponse = {
  global_metrics: StatsMetrics;
  devices: DeviceStats[];
  category_breakdown: Record<string, number>;
};
