import { CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-source-field-names.constant';

export const CHANNEL_ASSOCIATION_SOURCE_COLUMN_NAMES = [
  CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.accountOwnerId,
  CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.handle,
] as const;
