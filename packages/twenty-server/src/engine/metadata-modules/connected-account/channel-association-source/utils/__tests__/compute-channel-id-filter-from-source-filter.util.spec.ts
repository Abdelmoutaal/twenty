import { NO_CHANNEL_SENTINEL_ID } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/no-channel-sentinel-id.constant';
import { type ChannelAssociationSourceFilter } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source-filter.type';
import { type ChannelAssociationSource } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source.type';
import { computeChannelIdFilterFromSourceFilter } from 'src/engine/metadata-modules/connected-account/channel-association-source/utils/compute-channel-id-filter-from-source-filter.util';

const CHANNEL_ASSOCIATION_SOURCES: ChannelAssociationSource[] = [
  { channelId: 'tim-channel', handle: 'tim@apple.dev', accountOwnerId: 'tim' },
  {
    channelId: 'jony-channel',
    handle: 'jony@apple.dev',
    accountOwnerId: 'jony',
  },
  {
    channelId: 'shared-channel',
    handle: 'support@apple.dev',
    accountOwnerId: null,
  },
];

const computeChannelIds = ({
  fieldName,
  fieldFilter,
  matchingAccountOwnerIds,
}: Pick<ChannelAssociationSourceFilter, 'fieldName' | 'fieldFilter'> & {
  matchingAccountOwnerIds?: Set<string>;
}) =>
  computeChannelIdFilterFromSourceFilter({
    channelAssociationConfig: {
      channelKind: 'message',
      channelIdColumnName: 'messageChannelId',
    },
    fieldName,
    fieldFilter,
    channelAssociationSources: CHANNEL_ASSOCIATION_SOURCES,
    matchingAccountOwnerIds,
  }).messageChannelId.in;

describe('computeChannelIdFilterFromSourceFilter', () => {
  it.each([
    [{ eq: 'tim' }, ['tim-channel']],
    [{ in: ['tim', 'jony'] }, ['tim-channel', 'jony-channel']],
    [{ neq: 'tim' }, ['jony-channel']],
    [{ is: 'NULL' }, ['shared-channel']],
    [{ is: 'NOT_NULL' }, ['tim-channel', 'jony-channel']],
    [{ eq: 'nobody' }, [NO_CHANNEL_SENTINEL_ID]],
  ])(
    'should turn account owner filter %j into channels',
    (fieldFilter, expected) => {
      expect(
        computeChannelIds({ fieldName: 'accountOwnerId', fieldFilter }),
      ).toEqual(expected);
    },
  );

  it('should match channels by handle', () => {
    expect(
      computeChannelIds({
        fieldName: 'handle',
        fieldFilter: { ilike: '%SUPPORT%' },
      }),
    ).toEqual(['shared-channel']);
  });

  it('should match channels owned by the account owners a relation filter resolved', () => {
    expect(
      computeChannelIds({
        fieldName: 'accountOwner',
        fieldFilter: { name: { firstName: { eq: 'Jony' } } },
        matchingAccountOwnerIds: new Set(['jony']),
      }),
    ).toEqual(['jony-channel']);
  });
});
