import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { type WhereExpressionBuilder } from 'typeorm';

import { type WorkspaceInternalContext } from 'src/engine/twenty-orm/interfaces/workspace-internal-context.interface';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

// Column holding the owning workspace member, per object restricted by owner scope
const OWNER_COLUMN_BY_OBJECT_NAME: Readonly<Record<string, string>> = {
  company: 'accountOwnerId',
  opportunity: 'ownerId',
  person: 'createdByWorkspaceMemberId',
};

const getOwnerScopedRoleIds = (): string[] =>
  (process.env.OWNER_SCOPED_ROLE_IDS ?? '')
    .split(',')
    .map((roleId) => roleId.trim())
    .filter(isNonEmptyString);

type ApplyOwnerScopeArgs = {
  queryBuilder: Pick<WhereExpressionBuilder, 'andWhere'> & { alias: string };
  objectMetadata: Pick<FlatObjectMetadata, 'nameSingular'>;
  internalContext: Pick<WorkspaceInternalContext, 'userWorkspaceRoleMap'>;
  authContext: WorkspaceAuthContext;
};

// Restricts users whose role is listed in OWNER_SCOPED_ROLE_IDS to the records they own
export const applyOwnerScope = ({
  queryBuilder,
  objectMetadata,
  internalContext,
  authContext,
}: ApplyOwnerScopeArgs): void => {
  const ownerColumn = OWNER_COLUMN_BY_OBJECT_NAME[objectMetadata.nameSingular];

  if (!isDefined(ownerColumn) || !isUserAuthContext(authContext)) {
    return;
  }

  const userRoleId =
    internalContext.userWorkspaceRoleMap[authContext.userWorkspaceId];

  if (!getOwnerScopedRoleIds().includes(userRoleId)) {
    return;
  }

  queryBuilder.andWhere(
    `${queryBuilder.alias}.${ownerColumn} = :ownerScopeWorkspaceMemberId`,
    { ownerScopeWorkspaceMemberId: authContext.workspaceMemberId },
  );
};
