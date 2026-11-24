import { type StringFilter, type UUIDFilter } from 'twenty-shared/types';
import {
  isDefined,
  isMatchingStringFilter,
  isMatchingUUIDFilter,
} from 'twenty-shared/utils';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { NO_CHANNEL_SENTINEL_ID } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/no-channel-sentinel-id.constant';
import { type ChannelAssociationSourceFilter } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source-filter.type';
import { type ChannelAssociationSource } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source.type';

const isSourceMatchingFilter = ({
  source,
  fieldName,
  fieldFilter,
  matchingAccountOwnerIds,
}: Pick<ChannelAssociationSourceFilter, 'fieldName' | 'fieldFilter'> & {
  source: ChannelAssociationSource;
  matchingAccountOwnerIds: Set<string> | undefined;
}): boolean => {
  switch (fieldName) {
    case 'accountOwner':
      return (
        isDefined(source.accountOwnerId) &&
        isDefined(matchingAccountOwnerIds) &&
        matchingAccountOwnerIds.has(source.accountOwnerId)
      );
    case 'accountOwnerId':
      return isDefined(source.accountOwnerId)
        ? isMatchingUUIDFilter({
            uuidFilter: fieldFilter as UUIDFilter,
            value: source.accountOwnerId,
          })
        : fieldFilter.is === 'NULL';
    case 'handle':
      return isMatchingStringFilter({
        stringFilter: fieldFilter as StringFilter,
        value: source.handle,
      });
  }
};

export const computeChannelIdFilterFromSourceFilter = ({
  channelAssociationConfig,
  fieldName,
  fieldFilter,
  channelAssociationSources,
  matchingAccountOwnerIds,
}: Omit<ChannelAssociationSourceFilter, 'accountOwnerFlatObjectMetadata'> & {
  channelAssociationSources: ChannelAssociationSource[];
  matchingAccountOwnerIds: Set<string> | undefined;
}): ObjectRecordFilter => {
  const channelIds = channelAssociationSources
    .filter((source) =>
      isSourceMatchingFilter({
        source,
        fieldName,
        fieldFilter,
        matchingAccountOwnerIds,
      }),
    )
    .map(({ channelId }) => channelId);

  return {
    [channelAssociationConfig.channelIdColumnName]: {
      in: channelIds.length > 0 ? channelIds : [NO_CHANNEL_SENTINEL_ID],
    },
  };
};
