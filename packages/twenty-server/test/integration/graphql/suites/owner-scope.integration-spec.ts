import { randomUUID } from 'crypto';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { destroyOneOperationFactory } from 'test/integration/graphql/utils/destroy-one-operation-factory.util';
import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { createOneRole } from 'test/integration/metadata/suites/role/utils/create-one-role.util';
import { deleteOneRole } from 'test/integration/metadata/suites/role/utils/delete-one-role.util';
import { findOneRoleByLabel } from 'test/integration/metadata/suites/role/utils/find-one-role-by-label.util';
import { updateWorkspaceMemberRole } from 'test/integration/metadata/suites/role/utils/update-workspace-member-role.util';

import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

// Must match OWNER_SCOPED_ROLE_IDS in the environment of the server under test
const OWNER_SCOPE_TEST_ROLE_ID = '6f1e2b4a-0c3d-4e5f-8a9b-1c2d3e4f5a6b';

const JONY_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.JONY;
const JANE_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.JANE;

type ScopedObject = {
  singular: string;
  plural: string;
  // How a record is tied to its owner: an owner relation, or createdBy (the creator's token)
  buildOwnerData: (ownerId: string) => Record<string, string>;
  isOwnedByCreator: boolean;
  updateData: Record<string, string>;
  ownedRecordId: string;
  foreignRecordId: string;
};

const SCOPED_OBJECTS: ScopedObject[] = [
  {
    singular: 'company',
    plural: 'companies',
    buildOwnerData: (ownerId) => ({ accountOwnerId: ownerId }),
    isOwnedByCreator: false,
    updateData: { name: 'Owner scope updated' },
    ownedRecordId: randomUUID(),
    foreignRecordId: randomUUID(),
  },
  {
    singular: 'opportunity',
    plural: 'opportunities',
    buildOwnerData: (ownerId) => ({ ownerId }),
    isOwnedByCreator: false,
    updateData: { name: 'Owner scope updated' },
    ownedRecordId: randomUUID(),
    foreignRecordId: randomUUID(),
  },
  {
    singular: 'person',
    plural: 'people',
    buildOwnerData: () => ({}),
    isOwnedByCreator: true,
    updateData: { jobTitle: 'Owner scope updated' },
    ownedRecordId: randomUUID(),
    foreignRecordId: randomUUID(),
  },
];

const asJony = (operation: Parameters<typeof makeGraphqlAPIRequest>[0]) =>
  makeGraphqlAPIRequest(operation, APPLE_JONY_MEMBER_ACCESS_TOKEN);

const createRecord = async (
  object: ScopedObject,
  id: string,
  ownerId: string,
) => {
  const operation = createOneOperationFactory({
    objectMetadataSingularName: object.singular,
    gqlFields: 'id',
    data: { id, ...object.buildOwnerData(ownerId) },
  });
  const shouldCreateAsJony = object.isOwnedByCreator && ownerId === JONY_ID;
  const response = shouldCreateAsJony
    ? await asJony(operation)
    : await makeGraphqlAPIRequest(operation);

  expect(response.body.errors).toBeUndefined();
};

const findActiveRecordAsAdmin = async (object: ScopedObject, id: string) => {
  const response = await makeGraphqlAPIRequest(
    findOneOperationFactory({
      objectMetadataSingularName: object.singular,
      gqlFields: 'id',
      filter: { id: { eq: id }, deletedAt: { is: 'NULL' } },
    }),
  );

  return response.body.data?.[object.singular] ?? null;
};

describe('owner scope restricts owner-scoped roles to their own records', () => {
  let originalMemberRoleId: string;

  beforeAll(async () => {
    originalMemberRoleId = (await findOneRoleByLabel({ label: 'Member' })).id;

    await createOneRole({
      expectToFail: false,
      input: {
        id: OWNER_SCOPE_TEST_ROLE_ID,
        label: 'Owner Scope Test Role',
        description: 'Sales rep restricted to own records',
        icon: 'IconUser',
        canUpdateAllSettings: false,
        canAccessAllTools: true,
        canReadAllObjectRecords: true,
        canUpdateAllObjectRecords: true,
        canSoftDeleteAllObjectRecords: true,
        canDestroyAllObjectRecords: false,
        canBeAssignedToUsers: true,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: false,
      },
    });

    await updateWorkspaceMemberRole({
      input: { roleId: OWNER_SCOPE_TEST_ROLE_ID, workspaceMemberId: JONY_ID },
      expectToFail: false,
    });

    for (const object of SCOPED_OBJECTS) {
      await createRecord(object, object.ownedRecordId, JONY_ID);
      await createRecord(object, object.foreignRecordId, JANE_ID);
    }
  });

  afterAll(async () => {
    for (const object of SCOPED_OBJECTS) {
      for (const recordId of [object.ownedRecordId, object.foreignRecordId]) {
        await makeGraphqlAPIRequest(
          destroyOneOperationFactory({
            objectMetadataSingularName: object.singular,
            gqlFields: 'id',
            recordId,
          }),
        );
      }
    }

    await updateWorkspaceMemberRole({
      input: { roleId: originalMemberRoleId, workspaceMemberId: JONY_ID },
      expectToFail: false,
    });

    await deleteOneRole({
      expectToFail: false,
      input: { idToDelete: OWNER_SCOPE_TEST_ROLE_ID },
    });
  });

  describe.each(SCOPED_OBJECTS)('$singular', (object) => {
    it('lists only the records the user owns', async () => {
      const response = await asJony(
        findManyOperationFactory({
          objectMetadataSingularName: object.singular,
          objectMetadataPluralName: object.plural,
          gqlFields: 'id',
          filter: {
            id: { in: [object.ownedRecordId, object.foreignRecordId] },
          },
        }),
      );

      expect(response.body.errors).toBeUndefined();
      expect(
        response.body.data[object.plural].edges.map(
          (edge: { node: { id: string } }) => edge.node.id,
        ),
      ).toEqual([object.ownedRecordId]);
    });

    it('does not return a record owned by someone else', async () => {
      const response = await asJony(
        findOneOperationFactory({
          objectMetadataSingularName: object.singular,
          gqlFields: 'id',
          filter: { id: { eq: object.foreignRecordId } },
        }),
      );

      expect(response.body.data?.[object.singular] ?? null).toBeNull();
    });

    it('cannot soft-delete a record owned by someone else', async () => {
      await asJony(
        deleteOneOperationFactory({
          objectMetadataSingularName: object.singular,
          gqlFields: 'id',
          recordId: object.foreignRecordId,
        }),
      );

      const record = await findActiveRecordAsAdmin(
        object,
        object.foreignRecordId,
      );

      expect(record).not.toBeNull();
    });

    it('can update its own record but not one owned by someone else', async () => {
      const ownResponse = await asJony(
        updateOneOperationFactory({
          objectMetadataSingularName: object.singular,
          gqlFields: 'id',
          recordId: object.ownedRecordId,
          data: object.updateData,
        }),
      );
      const foreignResponse = await asJony(
        updateOneOperationFactory({
          objectMetadataSingularName: object.singular,
          gqlFields: 'id',
          recordId: object.foreignRecordId,
          data: object.updateData,
        }),
      );

      expect(ownResponse.body.errors).toBeUndefined();
      expect(foreignResponse.body.errors).toBeDefined();
    });
  });
});
