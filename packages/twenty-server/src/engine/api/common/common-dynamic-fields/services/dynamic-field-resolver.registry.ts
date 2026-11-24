import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import { isDefined } from 'twenty-shared/utils';

import { DYNAMIC_FIELD_RESOLVER_METADATA_KEY } from 'src/engine/api/common/common-dynamic-fields/constants/dynamic-field-resolver-metadata-key.constant';
import { type DynamicFieldResolverInstance } from 'src/engine/api/common/common-dynamic-fields/types/dynamic-field-resolver-instance.type';

@Injectable()
export class DynamicFieldResolverRegistry implements OnModuleInit {
  private readonly dynamicFieldResolverByObjectUniversalIdentifier = new Map<
    string,
    DynamicFieldResolverInstance
  >();

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit() {
    for (const { metatype, instance } of this.discoveryService.getProviders()) {
      if (
        !isDefined(metatype) ||
        !isDefined(instance) ||
        Reflect.getMetadata(DYNAMIC_FIELD_RESOLVER_METADATA_KEY, metatype) !==
          true
      ) {
        continue;
      }

      const dynamicFieldResolver = instance as DynamicFieldResolverInstance;

      this.dynamicFieldResolverByObjectUniversalIdentifier.set(
        dynamicFieldResolver.objectUniversalIdentifier,
        dynamicFieldResolver,
      );
    }
  }

  find(
    objectUniversalIdentifier: string,
  ): DynamicFieldResolverInstance | undefined {
    return this.dynamicFieldResolverByObjectUniversalIdentifier.get(
      objectUniversalIdentifier,
    );
  }
}
