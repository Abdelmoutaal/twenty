import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { type DynamicFieldFilter } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-filter.type';
import { type DynamicFieldResolverInstance } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-resolver-instance.type';
import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

type MapDynamicFieldFiltersArgs = {
  filter: ObjectRecordFilter;
  flatObjectMetadata: FlatObjectMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  findDynamicFieldResolver: (
    objectUniversalIdentifier: string,
  ) => DynamicFieldResolverInstance | undefined;
  mapDynamicFieldFilter: (
    dynamicFieldFilter: DynamicFieldFilter,
  ) => ObjectRecordFilter | undefined;
};

const findRelationTargetFlatObjectMetadata = ({
  fieldName,
  flatObjectMetadata,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: Pick<
  MapDynamicFieldFiltersArgs,
  'flatObjectMetadata' | 'flatObjectMetadataMaps' | 'flatFieldMetadataMaps'
> & { fieldName: string }): FlatObjectMetadata | undefined => {
  const { fieldIdByName, fieldIdByJoinColumnName } =
    buildFieldMapsFromFlatObjectMetadata(
      flatFieldMetadataMaps,
      flatObjectMetadata,
    );
  const fieldMetadataId = fieldIdByName[fieldName];

  if (
    !isDefined(fieldMetadataId) ||
    isDefined(fieldIdByJoinColumnName[fieldName])
  ) {
    return undefined;
  }

  const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: fieldMetadataId,
    flatEntityMaps: flatFieldMetadataMaps,
  });

  if (
    !isDefined(fieldMetadata) ||
    !isFlatFieldMetadataOfType(fieldMetadata, FieldMetadataType.RELATION) ||
    !isDefined(fieldMetadata.relationTargetObjectMetadataId)
  ) {
    return undefined;
  }

  return findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: fieldMetadata.relationTargetObjectMetadataId,
    flatEntityMaps: flatObjectMetadataMaps,
  });
};

export const mapDynamicFieldFilters = ({
  filter,
  flatObjectMetadata,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  findDynamicFieldResolver,
  mapDynamicFieldFilter,
}: MapDynamicFieldFiltersArgs): ObjectRecordFilter => {
  const dynamicFieldResolver = findDynamicFieldResolver(
    flatObjectMetadata.universalIdentifier,
  );
  const mapNestedFilter = (
    nestedFilter: ObjectRecordFilter,
    nestedFlatObjectMetadata: FlatObjectMetadata = flatObjectMetadata,
  ) =>
    mapDynamicFieldFilters({
      filter: nestedFilter,
      flatObjectMetadata: nestedFlatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      findDynamicFieldResolver,
      mapDynamicFieldFilter,
    });

  const untouchedFilter: ObjectRecordFilter = {};
  const mappedDynamicFieldFilters: ObjectRecordFilter[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      untouchedFilter[key] = value.map((nestedFilter) =>
        mapNestedFilter(nestedFilter),
      );
      continue;
    }

    if (key === 'not' && isPlainObject(value)) {
      untouchedFilter[key] = mapNestedFilter(value);
      continue;
    }

    if (!isPlainObject(value)) {
      untouchedFilter[key] = value;
      continue;
    }

    const relationTargetFlatObjectMetadata =
      findRelationTargetFlatObjectMetadata({
        fieldName: key,
        flatObjectMetadata,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      });
    const dynamicFieldName = isDefined(relationTargetFlatObjectMetadata)
      ? computeMorphOrRelationFieldJoinColumnName({ name: key })
      : key;

    if (dynamicFieldResolver?.dynamicFieldNames.includes(dynamicFieldName)) {
      const mappedDynamicFieldFilter = mapDynamicFieldFilter({
        dynamicFieldResolver,
        dynamicFieldName,
        dynamicFieldFilter: value,
        relationTargetFlatObjectMetadata,
      });

      if (isDefined(mappedDynamicFieldFilter)) {
        mappedDynamicFieldFilters.push(mappedDynamicFieldFilter);
        continue;
      }
    }

    untouchedFilter[key] = isDefined(relationTargetFlatObjectMetadata)
      ? mapNestedFilter(value, relationTargetFlatObjectMetadata)
      : value;
  }

  if (mappedDynamicFieldFilters.length === 0) {
    return untouchedFilter;
  }

  return {
    and: [
      ...(Object.keys(untouchedFilter).length > 0 ? [untouchedFilter] : []),
      ...mappedDynamicFieldFilters,
    ],
  };
};
