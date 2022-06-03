// @file Uses the AllowedExternalPositionTypesPerManagerPolicy to test the shared functionality of an UintListRegistryPerUserPolicyBase

import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  AllowedExternalPositionTypesPerManagerPolicy,
  PolicyManager,
  UintListRegistry,
} from '@enzymefinance/protocol';
import {
  policyManagerConfigArgs,
  StandardToken,
  uintListRegistryPerUserPolicyArgs,
  UintListUpdateType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

let fork: ProtocolDeployment;
let policyManager: PolicyManager;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  policyManager = fork.deployment.policyManager;
});

describe('addFundSettings', () => {
  let fundOwner: SignerWithAddress;
  let uintListRegistry: UintListRegistry,
    allowedExternalPositionTypesPerManagerPolicy: AllowedExternalPositionTypesPerManagerPolicy;
  let denominationAsset: StandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    uintListRegistry = fork.deployment.uintListRegistry;
    allowedExternalPositionTypesPerManagerPolicy = fork.deployment.allowedExternalPositionTypesPerManagerPolicy;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
  });

  it('unhappy path: cannot be called by a random user', async () => {
    await expect(
      allowedExternalPositionTypesPerManagerPolicy.addFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('unhappy path: unequal arrays', async () => {
    const user = randomAddress();
    const listsData = [
      {
        existingListIds: [1, 2],
      },
      {
        existingListIds: [3, 4],
      },
    ];

    await expect(
      createNewFund({
        denominationAsset,
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [allowedExternalPositionTypesPerManagerPolicy],
          settings: [
            uintListRegistryPerUserPolicyArgs({
              users: [user], // 1 user
              listsData, // listsData has 2 items
            }),
          ],
        }),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('unequal arrays');
  });

  it('happy path: one user with new lists, one user with existing lists', async () => {
    const userWithNewLists = randomAddress();
    const userWithExistingLists = randomAddress();

    // New lists
    const newlist1UpdateType = UintListUpdateType.AddAndRemove;
    const newlist1Item = BigNumber.from(10);
    const newlist1Id = await uintListRegistry.getListCount();

    const newlist2UpdateType = UintListUpdateType.None;
    const newlist2Item = BigNumber.from(20);
    const newlist2Id = newlist1Id.add(1);
    const newListIds = [newlist1Id, newlist2Id];

    // Existing lists, it does not matter whether or not lists actually exist
    const existingListIds = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2)];

    const users = [userWithNewLists, userWithExistingLists];
    const listIdsPerUser = [newListIds, existingListIds];

    const { comptrollerProxy, receipt, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPerManagerPolicy],
        settings: [
          uintListRegistryPerUserPolicyArgs({
            users: [userWithNewLists, userWithExistingLists],
            listsData: [
              {
                newListsArgs: [
                  {
                    initialItems: [newlist1Item],
                    updateType: newlist1UpdateType,
                  },
                  {
                    initialItems: [newlist2Item],
                    updateType: newlist2UpdateType,
                  },
                ],
              },
              {
                existingListIds,
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });

    // Assert local state
    expect(
      await allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, userWithNewLists),
    ).toMatchFunctionOutput(allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser, [
      newlist1Id,
      newlist2Id,
    ]);

    expect(
      await allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser(
        comptrollerProxy,
        userWithExistingLists,
      ),
    ).toMatchFunctionOutput(allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser, existingListIds);

    // Assert UintListRegistry state
    expect(await uintListRegistry.getListOwner(newlist1Id)).toMatchAddress(vaultProxy);
    expect(await uintListRegistry.getListUpdateType(newlist1Id)).toEqBigNumber(newlist1UpdateType);
    expect(await uintListRegistry.isInList(newlist1Id, newlist1Item)).toBe(true);

    expect(await uintListRegistry.getListOwner(newlist2Id)).toMatchAddress(vaultProxy);
    expect(await uintListRegistry.getListUpdateType(newlist2Id)).toEqBigNumber(newlist2UpdateType);
    expect(await uintListRegistry.isInList(newlist2Id, newlist2Item)).toBe(true);

    // Assert event
    const events = extractEvent(
      receipt,
      allowedExternalPositionTypesPerManagerPolicy.abi.getEvent('ListsSetForFundAndUser'),
    );

    expect(events.length).toBe(users.length);

    for (const i in users) {
      expect(events[i].args).toMatchObject({
        comptrollerProxy: comptrollerProxy.address,
        user: users[i],
        listIds: listIdsPerUser[i],
      });
    }
  });

  it('happy path: new list and existing list', async () => {
    const newListId = await uintListRegistry.getListCount();
    const existingListId = constants.MaxUint256; // Use max uint as arbitrary list id
    const user = randomAddress();

    const { comptrollerProxy, receipt } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPerManagerPolicy],
        settings: [
          uintListRegistryPerUserPolicyArgs({
            users: [user],
            listsData: [
              {
                existingListIds: [existingListId],
                newListsArgs: [
                  {
                    initialItems: [],
                    updateType: UintListUpdateType.None,
                  },
                ],
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });

    // Assert local state
    expect(
      await allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, user),
    ).toMatchFunctionOutput(allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser, [
      existingListId,
      newListId,
    ]);

    // Assert event
    assertEvent(receipt, allowedExternalPositionTypesPerManagerPolicy.abi.getEvent('ListsSetForFundAndUser'), {
      comptrollerProxy,
      user,
      listIds: [existingListId, newListId],
    });
  });

  it('happy path: update to empty array', async () => {
    const existingListId = constants.MaxUint256; // Use max uint as arbitrary list id
    const user = randomAddress();

    const { comptrollerProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPerManagerPolicy],
        settings: [
          uintListRegistryPerUserPolicyArgs({
            users: [user],
            listsData: [
              {
                existingListIds: [existingListId],
                newListsArgs: [
                  {
                    initialItems: [],
                    updateType: UintListUpdateType.None,
                  },
                ],
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });

    // update to empty array
    const receipt = await policyManager.connect(fundOwner).updatePolicySettingsForFund(
      comptrollerProxy,
      allowedExternalPositionTypesPerManagerPolicy,
      uintListRegistryPerUserPolicyArgs({
        users: [user],
        listsData: [
          {
            existingListIds: [],
            newListsArgs: [],
          },
        ],
      }),
    );

    // Assert local state
    expect(
      await allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, user),
    ).toMatchFunctionOutput(allowedExternalPositionTypesPerManagerPolicy.getListIdsForFundAndUser, []);

    // Assert event
    assertEvent(receipt, allowedExternalPositionTypesPerManagerPolicy.abi.getEvent('ListsSetForFundAndUser'), {
      comptrollerProxy,
      user,
      listIds: [],
    });
  });
});
