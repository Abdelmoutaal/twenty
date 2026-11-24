import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { MessageChannelType, type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { CommonQueryParser } from 'src/engine/api/common/common-query-parsers/common-query.parser';
import { type CommonSelection } from 'src/engine/api/common/types/common-selection.type';
import { getRelationSelectionEntries } from 'src/engine/api/common/utils/get-relation-selection-entries.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CHANNEL_ASSOCIATION_CONFIG_BY_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-config-by-object-universal-identifier.constant';
import { CHANNEL_ASSOCIATION_SOURCE_COLUMN_NAMES } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-source-column-names.constant';
import { CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-source-field-names.constant';
import { type ChannelAssociationConfig } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-config.type';
import { type ChannelAssociationSourceFilter } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source-filter.type';
import { type ChannelAssociationSourceLoader } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source-loader.type';
import { type ChannelAssociationSource } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source.type';
import { computeChannelIdFilterFromSourceFilter } from 'src/engine/metadata-modules/connected-account/channel-association-source/utils/compute-channel-id-filter-from-source-filter.util';
import { mapChannelAssociationSourceFilters } from 'src/engine/metadata-modules/connected-account/channel-association-source/utils/map-channel-association-source-filters.util';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { findFlatFieldMetadataByName } from 'src/engine/metadata-modules/flat-field-metadata/utils/find-flat-field-metadata-by-name.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

type RewriteSourceFilterArgs = {
  authContext: WorkspaceAuthContext;
  filter: ObjectRecordFilter;
  flatObjectMetadata: FlatObjectMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
};

type ChannelRow = {
  id: string;
  handle: string;
  userWorkspaceId: string | null;
  hasAccountOwner: boolean;
};

@Injectable()
export class ChannelAssociationSourceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  createSourceLoader(workspaceId: string): ChannelAssociationSourceLoader {
    const sourcesByChannelKind = new Map<
      ChannelAssociationConfig['channelKind'],
      Promise<ChannelAssociationSource[]>
    >();

    return (channelKind) => {
      const loadingSources =
        sourcesByChannelKind.get(channelKind) ??
        this.findSources({ workspaceId, channelKind });

      sourcesByChannelKind.set(channelKind, loadingSources);

      return loadingSources;
    };
  }

  async assignSourcesToRecords({
    loadSources,
    flatObjectMetadata,
    records,
  }: {
    loadSources: ChannelAssociationSourceLoader;
    flatObjectMetadata: FlatObjectMetadata;
    records: ObjectRecord[];
  }): Promise<void> {
    const channelAssociationConfig =
      CHANNEL_ASSOCIATION_CONFIG_BY_OBJECT_UNIVERSAL_IDENTIFIER[
        flatObjectMetadata.universalIdentifier
      ];

    if (!isDefined(channelAssociationConfig)) {
      return;
    }

    const recordsToResolve = records.filter(
      (record) =>
        isDefined(record[channelAssociationConfig.channelIdColumnName]) &&
        CHANNEL_ASSOCIATION_SOURCE_COLUMN_NAMES.some(
          (columnName) => columnName in record,
        ),
    );

    if (recordsToResolve.length === 0) {
      return;
    }

    const sourceByChannelId = new Map(
      (await loadSources(channelAssociationConfig.channelKind)).map(
        (source) => [source.channelId, source],
      ),
    );

    for (const record of recordsToResolve) {
      const source = sourceByChannelId.get(
        record[channelAssociationConfig.channelIdColumnName],
      );

      if (CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.accountOwnerId in record) {
        record[CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.accountOwnerId] =
          source?.accountOwnerId ?? null;
      }

      if (CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.handle in record) {
        record[CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.handle] =
          source?.handle ?? null;
      }
    }
  }

  async rewriteSelectionSourceFilters({
    authContext,
    selection,
    flatObjectMetadata,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  }: Omit<RewriteSourceFilterArgs, 'filter'> & {
    selection: CommonSelection;
  }): Promise<void> {
    for (const { relationSelection } of getRelationSelectionEntries(
      selection,
    )) {
      const relationFieldMetadata = findFlatFieldMetadataByName({
        fieldName: relationSelection.fieldName,
        flatObjectMetadata,
        flatFieldMetadataMaps,
      });
      const targetFlatObjectMetadata = isDefined(
        relationFieldMetadata?.relationTargetObjectMetadataId,
      )
        ? findFlatEntityByIdInFlatEntityMaps({
            flatEntityId: relationFieldMetadata.relationTargetObjectMetadataId,
            flatEntityMaps: flatObjectMetadataMaps,
          })
        : undefined;

      if (!isDefined(targetFlatObjectMetadata)) {
        continue;
      }

      if (isDefined(relationSelection.filter)) {
        relationSelection.filter = await this.rewriteSourceFilter({
          authContext,
          filter: relationSelection.filter,
          flatObjectMetadata: targetFlatObjectMetadata,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        });
      }

      await this.rewriteSelectionSourceFilters({
        authContext,
        selection: relationSelection.selection,
        flatObjectMetadata: targetFlatObjectMetadata,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      });
    }
  }

  async rewriteSourceFilter({
    authContext,
    filter,
    flatObjectMetadata,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  }: RewriteSourceFilterArgs): Promise<ObjectRecordFilter> {
    const sourceFilters: ChannelAssociationSourceFilter[] = [];

    mapChannelAssociationSourceFilters({
      filter,
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      mapSourceFilter: (sourceFilter) => {
        sourceFilters.push(sourceFilter);

        return undefined;
      },
    });

    if (sourceFilters.length === 0) {
      return filter;
    }

    const loadSources = this.createSourceLoader(authContext.workspace.id);
    const sourcesByChannelKind = new Map<
      ChannelAssociationConfig['channelKind'],
      ChannelAssociationSource[]
    >();
    const matchingAccountOwnerIdsByFieldFilter = new Map<
      Record<string, unknown>,
      Set<string>
    >();

    for (const {
      channelAssociationConfig: { channelKind },
      fieldName,
      fieldFilter,
      accountOwnerFlatObjectMetadata,
    } of sourceFilters) {
      sourcesByChannelKind.set(channelKind, await loadSources(channelKind));

      if (
        fieldName === CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES.accountOwner &&
        isDefined(accountOwnerFlatObjectMetadata)
      ) {
        matchingAccountOwnerIdsByFieldFilter.set(
          fieldFilter,
          await this.findMatchingAccountOwnerIds({
            authContext,
            accountOwnerFilter: fieldFilter,
            accountOwnerFlatObjectMetadata,
            flatObjectMetadataMaps,
            flatFieldMetadataMaps,
          }),
        );
      }
    }

    return mapChannelAssociationSourceFilters({
      filter,
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      mapSourceFilter: ({ channelAssociationConfig, fieldName, fieldFilter }) =>
        computeChannelIdFilterFromSourceFilter({
          channelAssociationConfig,
          fieldName,
          fieldFilter,
          channelAssociationSources:
            sourcesByChannelKind.get(channelAssociationConfig.channelKind) ??
            [],
          matchingAccountOwnerIds:
            matchingAccountOwnerIdsByFieldFilter.get(fieldFilter),
        }),
    });
  }

  private async findMatchingAccountOwnerIds({
    authContext,
    accountOwnerFilter,
    accountOwnerFlatObjectMetadata,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  }: Pick<
    RewriteSourceFilterArgs,
    'authContext' | 'flatObjectMetadataMaps' | 'flatFieldMetadataMaps'
  > & {
    accountOwnerFilter: ObjectRecordFilter;
    accountOwnerFlatObjectMetadata: FlatObjectMetadata;
  }): Promise<Set<string>> {
    const { nameSingular } = accountOwnerFlatObjectMetadata;

    const accountOwners =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const queryBuilder = this.workspaceOrmManager
          .getRepository(nameSingular)
          .createQueryBuilder(nameSingular);

        new CommonQueryParser({
          flatObjectMetadata: accountOwnerFlatObjectMetadata,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        }).applyFilterToBuilder({
          queryBuilder,
          objectNameSingular: nameSingular,
          recordFilter: accountOwnerFilter,
        });

        return queryBuilder.setFindOptions({ select: { id: true } }).getMany();
      }, authContext);

    return new Set(accountOwners.map(({ id }) => id));
  }

  private async findSources({
    workspaceId,
    channelKind,
  }: {
    workspaceId: string;
    channelKind: ChannelAssociationConfig['channelKind'];
  }): Promise<ChannelAssociationSource[]> {
    const [channelRows, { flatWorkspaceMemberMaps }] = await Promise.all([
      channelKind === 'message'
        ? this.findMessageChannelRows(workspaceId)
        : this.findCalendarChannelRows(workspaceId),
      this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatWorkspaceMemberMaps',
      ]),
    ]);

    return channelRows.map(
      ({ id, handle, userWorkspaceId, hasAccountOwner }) => ({
        channelId: id,
        handle,
        accountOwnerId:
          hasAccountOwner && isDefined(userWorkspaceId)
            ? (flatWorkspaceMemberMaps.idByUserWorkspaceId[userWorkspaceId] ??
              null)
            : null,
      }),
    );
  }

  private async findMessageChannelRows(
    workspaceId: string,
  ): Promise<ChannelRow[]> {
    const messageChannels = await this.dataSource
      .getRepository(MessageChannelEntity)
      .find({
        where: { workspaceId },
        select: {
          id: true,
          handle: true,
          type: true,
          connectedAccount: { id: true, userWorkspaceId: true },
        },
        relations: { connectedAccount: true },
      });

    return messageChannels.map(({ id, handle, type, connectedAccount }) => ({
      id,
      handle,
      userWorkspaceId: connectedAccount?.userWorkspaceId ?? null,
      hasAccountOwner: type !== MessageChannelType.EMAIL_GROUP,
    }));
  }

  private async findCalendarChannelRows(
    workspaceId: string,
  ): Promise<ChannelRow[]> {
    const calendarChannels = await this.dataSource
      .getRepository(CalendarChannelEntity)
      .find({
        where: { workspaceId },
        select: {
          id: true,
          handle: true,
          connectedAccount: { id: true, userWorkspaceId: true },
        },
        relations: { connectedAccount: true },
      });

    return calendarChannels.map(({ id, handle, connectedAccount }) => ({
      id,
      handle,
      userWorkspaceId: connectedAccount?.userWorkspaceId ?? null,
      hasAccountOwner: true,
    }));
  }
}
