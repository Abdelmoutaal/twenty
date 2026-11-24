import { Injectable } from '@nestjs/common';

import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { DYNAMIC_FIELD_NO_MATCH_SENTINEL_ID } from 'src/engine/api/common/common-dynamic-fields/constants/dynamic-field-no-match-sentinel-id.constant';
import { DynamicFieldResolverRegistry } from 'src/engine/api/common/common-dynamic-fields/services/dynamic-field-resolver.registry';
import { type DynamicFieldContextLoader } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-context-loader.type';
import { type DynamicFieldFilter } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-filter.type';
import { type DynamicFieldResolverInstance } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-resolver-instance.type';
import { mapDynamicFieldFilters } from 'src/engine/api/common/common-dynamic-fields/utils/map-dynamic-field-filters.util';
import { CommonQueryParser } from 'src/engine/api/common/common-query-parsers/common-query.parser';
import { type CommonSelection } from 'src/engine/api/common/types/common-selection.type';
import { getRelationSelectionEntries } from 'src/engine/api/common/utils/get-relation-selection-entries.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { findFlatFieldMetadataByName } from 'src/engine/metadata-modules/flat-field-metadata/utils/find-flat-field-metadata-by-name.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

type DynamicFieldMetadataArgs = {
  authContext: WorkspaceAuthContext;
  flatObjectMetadata: FlatObjectMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
};

@Injectable()
export class DynamicFieldService {
  constructor(
    private readonly dynamicFieldResolverRegistry: DynamicFieldResolverRegistry,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  createContextLoader(workspaceId: string): DynamicFieldContextLoader {
    const loadingContextByDynamicFieldResolver = new Map<
      DynamicFieldResolverInstance,
      Promise<unknown>
    >();

    return <TContext>(
      dynamicFieldResolver: DynamicFieldResolverInstance<TContext>,
    ) => {
      const loadingContext =
        loadingContextByDynamicFieldResolver.get(dynamicFieldResolver) ??
        dynamicFieldResolver.loadContext({ workspaceId });

      loadingContextByDynamicFieldResolver.set(
        dynamicFieldResolver,
        loadingContext,
      );

      return loadingContext as Promise<TContext>;
    };
  }

  async assignDynamicFieldValuesToRecords({
    loadContext,
    flatObjectMetadata,
    records,
  }: {
    loadContext: DynamicFieldContextLoader;
    flatObjectMetadata: FlatObjectMetadata;
    records: ObjectRecord[];
  }): Promise<void> {
    const dynamicFieldResolver = this.dynamicFieldResolverRegistry.find(
      flatObjectMetadata.universalIdentifier,
    );

    if (!isDefined(dynamicFieldResolver)) {
      return;
    }

    const recordsToResolve = records.filter(
      (record) =>
        dynamicFieldResolver.sourceColumnNames.every(
          (sourceColumnName) => sourceColumnName in record,
        ) &&
        dynamicFieldResolver.dynamicFieldNames.some(
          (dynamicFieldName) => dynamicFieldName in record,
        ),
    );

    if (recordsToResolve.length === 0) {
      return;
    }

    const context = await loadContext(dynamicFieldResolver);

    for (const record of recordsToResolve) {
      const dynamicFieldValues = dynamicFieldResolver.computeValues({
        record,
        context,
      });

      for (const dynamicFieldName of dynamicFieldResolver.dynamicFieldNames) {
        if (dynamicFieldName in record) {
          record[dynamicFieldName] = dynamicFieldValues[dynamicFieldName];
        }
      }
    }
  }

  async prepareSelection({
    selection,
    ...dynamicFieldMetadataArgs
  }: DynamicFieldMetadataArgs & {
    selection: CommonSelection;
  }): Promise<void> {
    const {
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    } = dynamicFieldMetadataArgs;
    const dynamicFieldResolver = this.dynamicFieldResolverRegistry.find(
      flatObjectMetadata.universalIdentifier,
    );
    const relationSelectionEntries = getRelationSelectionEntries(selection);

    if (isDefined(dynamicFieldResolver)) {
      const selectedColumnNames = [
        ...Object.keys(selection.columns),
        ...relationSelectionEntries.map(({ relationSelection }) =>
          computeMorphOrRelationFieldJoinColumnName({
            name: relationSelection.fieldName,
          }),
        ),
      ];

      if (
        selectedColumnNames.some((columnName) =>
          dynamicFieldResolver.dynamicFieldNames.includes(columnName),
        )
      ) {
        for (const sourceColumnName of dynamicFieldResolver.sourceColumnNames) {
          selection.columns[sourceColumnName] = true;
        }
      }
    }

    for (const { relationSelection } of relationSelectionEntries) {
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
        relationSelection.filter = await this.rewriteDynamicFieldFilters({
          ...dynamicFieldMetadataArgs,
          filter: relationSelection.filter,
          flatObjectMetadata: targetFlatObjectMetadata,
        });
      }

      await this.prepareSelection({
        ...dynamicFieldMetadataArgs,
        selection: relationSelection.selection,
        flatObjectMetadata: targetFlatObjectMetadata,
      });
    }
  }

  async rewriteDynamicFieldFilters({
    filter,
    ...dynamicFieldMetadataArgs
  }: DynamicFieldMetadataArgs & {
    filter: ObjectRecordFilter;
  }): Promise<ObjectRecordFilter> {
    const {
      authContext,
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    } = dynamicFieldMetadataArgs;
    const mapFilters = (
      mapDynamicFieldFilter: (
        dynamicFieldFilter: DynamicFieldFilter,
      ) => ObjectRecordFilter | undefined,
    ) =>
      mapDynamicFieldFilters({
        filter,
        flatObjectMetadata,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        findDynamicFieldResolver: (objectUniversalIdentifier) =>
          this.dynamicFieldResolverRegistry.find(objectUniversalIdentifier),
        mapDynamicFieldFilter,
      });

    const dynamicFieldFilters: DynamicFieldFilter[] = [];

    mapFilters((dynamicFieldFilter) => {
      dynamicFieldFilters.push(dynamicFieldFilter);

      return undefined;
    });

    if (dynamicFieldFilters.length === 0) {
      return filter;
    }

    const loadContext = this.createContextLoader(authContext.workspace.id);
    const sourceFilterByDynamicFieldFilter = new Map<
      Record<string, unknown>,
      ObjectRecordFilter | undefined
    >();

    for (const {
      dynamicFieldResolver,
      dynamicFieldName,
      dynamicFieldFilter,
      relationTargetFlatObjectMetadata,
    } of dynamicFieldFilters) {
      sourceFilterByDynamicFieldFilter.set(
        dynamicFieldFilter,
        dynamicFieldResolver.computeSourceFilter({
          dynamicFieldName,
          dynamicFieldFilter: isDefined(relationTargetFlatObjectMetadata)
            ? {
                in: await this.findMatchingRelationTargetIds({
                  ...dynamicFieldMetadataArgs,
                  filter: dynamicFieldFilter,
                  flatObjectMetadata: relationTargetFlatObjectMetadata,
                }),
              }
            : dynamicFieldFilter,
          context: await loadContext(dynamicFieldResolver),
        }),
      );
    }

    return mapFilters(({ dynamicFieldFilter }) =>
      sourceFilterByDynamicFieldFilter.get(dynamicFieldFilter),
    );
  }

  private async findMatchingRelationTargetIds({
    authContext,
    filter,
    flatObjectMetadata,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  }: DynamicFieldMetadataArgs & {
    filter: ObjectRecordFilter;
  }): Promise<string[]> {
    const { nameSingular } = flatObjectMetadata;

    const relationTargets =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const queryBuilder = this.workspaceOrmManager
          .getRepository(nameSingular)
          .createQueryBuilder(nameSingular);

        new CommonQueryParser({
          flatObjectMetadata,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        }).applyFilterToBuilder({
          queryBuilder,
          objectNameSingular: nameSingular,
          recordFilter: filter,
        });

        return queryBuilder.setFindOptions({ select: { id: true } }).getMany();
      }, authContext);

    return relationTargets.length > 0
      ? relationTargets.map(({ id }) => id)
      : [DYNAMIC_FIELD_NO_MATCH_SENTINEL_ID];
  }
}
