import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkspaceInternalContext } from 'src/engine/twenty-orm/interfaces/workspace-internal-context.interface';
import { applyOwnerScope } from 'src/engine/twenty-orm/utils/apply-owner-scope.util';

const SCOPED_ROLE_ID = 'sales-role';
const OTHER_ROLE_ID = 'admin-role';
const USER_WORKSPACE_ID = 'user-workspace-1';
const WORKSPACE_MEMBER_ID = 'workspace-member-1';

const buildInternalContext = (roleId: string) =>
  ({
    userWorkspaceRoleMap: { [USER_WORKSPACE_ID]: roleId },
  }) as unknown as WorkspaceInternalContext;

const userAuthContext = {
  type: 'user',
  workspace: { id: 'workspace-1' },
  userWorkspaceId: USER_WORKSPACE_ID,
  workspaceMemberId: WORKSPACE_MEMBER_ID,
} as unknown as WorkspaceAuthContext;

const apiKeyAuthContext = {
  type: 'apiKey',
  workspace: { id: 'workspace-1' },
  apiKey: { id: 'api-key-1' },
} as unknown as WorkspaceAuthContext;

const buildObjectMetadata = (nameSingular: string) =>
  ({ nameSingular }) as FlatObjectMetadata;

const buildQueryBuilder = () => ({ alias: 'record', andWhere: jest.fn() });

const runApplyOwnerScope = ({
  nameSingular,
  roleId = SCOPED_ROLE_ID,
  authContext = userAuthContext,
}: {
  nameSingular: string;
  roleId?: string;
  authContext?: WorkspaceAuthContext;
}) => {
  const queryBuilder = buildQueryBuilder();

  applyOwnerScope({
    queryBuilder,
    objectMetadata: buildObjectMetadata(nameSingular),
    internalContext: buildInternalContext(roleId),
    authContext,
  });

  return queryBuilder;
};

describe('applyOwnerScope', () => {
  const originalScopedRoleIds = process.env.OWNER_SCOPED_ROLE_IDS;

  beforeEach(() => {
    process.env.OWNER_SCOPED_ROLE_IDS = ` ${SCOPED_ROLE_ID} , other-scoped-role`;
  });

  afterAll(() => {
    process.env.OWNER_SCOPED_ROLE_IDS = originalScopedRoleIds;
  });

  it.each([
    ['company', 'accountOwnerId'],
    ['opportunity', 'ownerId'],
    ['person', 'createdByWorkspaceMemberId'],
  ])(
    'restricts %s records to the current workspace member through %s',
    (nameSingular, ownerColumn) => {
      const queryBuilder = runApplyOwnerScope({ nameSingular });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        `"record"."${ownerColumn}" = :ownerScopeWorkspaceMemberId`,
        { ownerScopeWorkspaceMemberId: WORKSPACE_MEMBER_ID },
      );
    },
  );

  it('leaves objects without an owner rule untouched', () => {
    const queryBuilder = runApplyOwnerScope({ nameSingular: 'note' });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('leaves users whose role is not owner-scoped untouched', () => {
    const queryBuilder = runApplyOwnerScope({
      nameSingular: 'company',
      roleId: OTHER_ROLE_ID,
    });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('leaves non-user contexts such as API keys untouched', () => {
    const queryBuilder = runApplyOwnerScope({
      nameSingular: 'company',
      authContext: apiKeyAuthContext,
    });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('does nothing when no owner-scoped role is configured', () => {
    delete process.env.OWNER_SCOPED_ROLE_IDS;

    const queryBuilder = runApplyOwnerScope({ nameSingular: 'company' });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });
});
