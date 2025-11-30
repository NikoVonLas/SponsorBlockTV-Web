export type DeviceModel = {
  screen_id: string;
  name: string;
  offset: number;
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
