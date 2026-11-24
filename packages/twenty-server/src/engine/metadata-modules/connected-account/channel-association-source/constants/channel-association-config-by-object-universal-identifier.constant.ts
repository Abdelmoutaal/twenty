import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type ChannelAssociationConfig } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-config.type';

export const CHANNEL_ASSOCIATION_CONFIG_BY_OBJECT_UNIVERSAL_IDENTIFIER: Partial<
  Record<string, ChannelAssociationConfig>
> = {
  [STANDARD_OBJECTS.calendarChannelEventAssociation.universalIdentifier]: {
    channelKind: 'calendar',
    channelIdColumnName: 'calendarChannelId',
  },
  [STANDARD_OBJECTS.messageChannelMessageAssociation.universalIdentifier]: {
    channelKind: 'message',
    channelIdColumnName: 'messageChannelId',
  },
};
