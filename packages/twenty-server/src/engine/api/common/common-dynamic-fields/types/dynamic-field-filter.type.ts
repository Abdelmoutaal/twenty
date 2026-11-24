import { type DynamicFieldResolverInstance } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-resolver-instance.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export type DynamicFieldFilter = {
  dynamicFieldResolver: DynamicFieldResolverInstance;
  dynamicFieldName: string;
  dynamicFieldFilter: Record<string, unknown>;
  relationTargetFlatObjectMetadata: FlatObjectMetadata | undefined;
};
