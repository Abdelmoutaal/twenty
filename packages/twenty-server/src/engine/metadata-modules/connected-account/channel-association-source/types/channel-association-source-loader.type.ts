import { type ChannelAssociationConfig } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-config.type';
import { type ChannelAssociationSource } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source.type';

export type ChannelAssociationSourceLoader = (
  channelKind: ChannelAssociationConfig['channelKind'],
) => Promise<ChannelAssociationSource[]>;
