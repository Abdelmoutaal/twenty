import { type CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-source-field-names.constant';
import { type ChannelAssociationConfig } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-config.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export type ChannelAssociationSourceFilter = {
  channelAssociationConfig: ChannelAssociationConfig;
  fieldName: keyof typeof CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES;
  fieldFilter: Record<string, unknown>;
  accountOwnerFlatObjectMetadata: FlatObjectMetadata | undefined;
};
