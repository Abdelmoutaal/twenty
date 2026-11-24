import { Module } from '@nestjs/common';

import { ChannelAssociationSourceService } from 'src/engine/metadata-modules/connected-account/channel-association-source/services/channel-association-source.service';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [WorkspaceCacheModule],
  providers: [ChannelAssociationSourceService],
  exports: [ChannelAssociationSourceService],
})
export class ChannelAssociationSourceModule {}
