import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { CHANNEL_ASSOCIATION_CONFIG_BY_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-config-by-object-universal-identifier.constant';
import { CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES } from 'src/engine/metadata-modules/connected-account/channel-association-source/constants/channel-association-source-field-names.constant';
import { type ChannelAssociationSourceFilter } from 'src/engine/metadata-modules/connected-account/channel-association-source/types/channel-association-source-filter.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

type MapChannelAssociationSourceFiltersArgs = {
  filter: ObjectRecordFilter;
  flatObjectMetadata: FlatObjectMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  mapSourceFilter: (
    sourceFilter: ChannelAssociationSourceFilter,
  ) => ObjectRecordFilter | undefined;
};

const findRelationTargetFlatObjectMetadata = ({
  fieldName,
  flatObjectMetadata,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: Pick<
  MapChannelAssociationSourceFiltersArgs,
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

const isChannelAssociationSourceFieldName = (
  key: string,
): key is ChannelAssociationSourceFilter['fieldName'] =>
  Object.keys(CHANNEL_ASSOCIATION_SOURCE_FIELD_NAMES).includes(key);

export const mapChannelAssociationSourceFilters = ({
  filter,
  flatObjectMetadata,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  mapSourceFilter,
}: MapChannelAssociationSourceFiltersArgs): ObjectRecordFilter => {
  const channelAssociationConfig =
    CHANNEL_ASSOCIATION_CONFIG_BY_OBJECT_UNIVERSAL_IDENTIFIER[
      flatObjectMetadata.universalIdentifier
    ];
  const mapNestedFilter = (
    nestedFilter: ObjectRecordFilter,
    nestedFlatObjectMetadata: FlatObjectMetadata = flatObjectMetadata,
  ) =>
    mapChannelAssociationSourceFilters({
      filter: nestedFilter,
      flatObjectMetadata: nestedFlatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      mapSourceFilter,
    });

  const untouchedFilter: ObjectRecordFilter = {};
  const mappedSourceFilters: ObjectRecordFilter[] = [];

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

    const relationTargetFlatObjectMetadata = isPlainObject(value)
      ? findRelationTargetFlatObjectMetadata({
          fieldName: key,
          flatObjectMetadata,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        })
      : undefined;

    if (
      isDefined(channelAssociationConfig) &&
      isChannelAssociationSourceFieldName(key) &&
      isPlainObject(value)
    ) {
      const mappedSourceFilter = mapSourceFilter({
        channelAssociationConfig,
        fieldName: key,
        fieldFilter: value,
        accountOwnerFlatObjectMetadata: relationTargetFlatObjectMetadata,
      });

      if (isDefined(mappedSourceFilter)) {
        mappedSourceFilters.push(mappedSourceFilter);
        continue;
      }
    }

    untouchedFilter[key] = isDefined(relationTargetFlatObjectMetadata)
      ? mapNestedFilter(value, relationTargetFlatObjectMetadata)
      : value;
  }

  if (mappedSourceFilters.length === 0) {
    return untouchedFilter;
  }

  return {
    and: [
      ...(Object.keys(untouchedFilter).length > 0 ? [untouchedFilter] : []),
      ...mappedSourceFilters,
    ],
  };
};
