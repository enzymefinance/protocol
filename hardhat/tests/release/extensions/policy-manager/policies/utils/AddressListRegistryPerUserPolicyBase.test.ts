// @file Uses the AllowedAdaptersPerManagerPolicy to test the shared functionality of an AddressListRegistryPerUserPolicyBase

import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { AddressListRegistry, AllowedAdaptersPerManagerPolicy, PolicyManager } from '@enzymefinance/protocol';
import {
  addressListRegistryPerUserPolicyArgs,
  AddressListUpdateType,
  ITestStandardToken,
  policyManagerConfigArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
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
  let addressListRegistry: AddressListRegistry, allowedAdaptersPerManagerPolicy: AllowedAdaptersPerManagerPolicy;
  let denominationAsset: ITestStandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    addressListRegistry = fork.deployment.addressListRegistry;
    allowedAdaptersPerManagerPolicy = fork.deployment.allowedAdaptersPerManagerPolicy;

    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);
  });

  it('unhappy path: cannot be called by a random user', async () => {
    await expect(allowedAdaptersPerManagerPolicy.addFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
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
          policies: [allowedAdaptersPerManagerPolicy],
          settings: [
            addressListRegistryPerUserPolicyArgs({
              users: [user], // 1 user
              listsData, // listsData has 2 items
            }),
          ],
        }),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('__updateListsForFund: unequal arrays');
  });

  it('happy path: one user with new lists, one user with existing lists', async () => {
    const userWithNewLists = randomAddress();
    const userWithExistingLists = randomAddress();

    // New lists
    const newlist1UpdateType = AddressListUpdateType.AddAndRemove;
    const newlist1Item = randomAddress();
    const newlist1Id = await addressListRegistry.getListCount();

    const newlist2UpdateType = AddressListUpdateType.None;
    const newlist2Item = randomAddress();
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
        policies: [allowedAdaptersPerManagerPolicy],
        settings: [
          addressListRegistryPerUserPolicyArgs({
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
      await allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, userWithNewLists),
    ).toMatchFunctionOutput(allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser, [newlist1Id, newlist2Id]);

    expect(
      await allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, userWithExistingLists),
    ).toMatchFunctionOutput(allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser, existingListIds);

    // Assert AddressListRegistry state
    expect(await addressListRegistry.getListOwner(newlist1Id)).toMatchAddress(vaultProxy);
    expect(await addressListRegistry.getListUpdateType(newlist1Id)).toEqBigNumber(newlist1UpdateType);
    expect(await addressListRegistry.isInList(newlist1Id, newlist1Item)).toBe(true);

    expect(await addressListRegistry.getListOwner(newlist2Id)).toMatchAddress(vaultProxy);
    expect(await addressListRegistry.getListUpdateType(newlist2Id)).toEqBigNumber(newlist2UpdateType);
    expect(await addressListRegistry.isInList(newlist2Id, newlist2Item)).toBe(true);

    // Assert event
    const events = extractEvent(receipt, allowedAdaptersPerManagerPolicy.abi.getEvent('ListsSetForFundAndUser'));

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
    const newListId = await addressListRegistry.getListCount();
    const existingListId = constants.MaxUint256; // Use max uint as arbitrary list id
    const user = randomAddress();

    const { comptrollerProxy, receipt } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedAdaptersPerManagerPolicy],
        settings: [
          addressListRegistryPerUserPolicyArgs({
            users: [user],
            listsData: [
              {
                existingListIds: [existingListId],
                newListsArgs: [
                  {
                    initialItems: [],
                    updateType: AddressListUpdateType.None,
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
      await allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, user),
    ).toMatchFunctionOutput(allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser, [existingListId, newListId]);

    // Assert event
    assertEvent(receipt, allowedAdaptersPerManagerPolicy.abi.getEvent('ListsSetForFundAndUser'), {
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
        policies: [allowedAdaptersPerManagerPolicy],
        settings: [
          addressListRegistryPerUserPolicyArgs({
            users: [user],
            listsData: [
              {
                existingListIds: [existingListId],
                newListsArgs: [
                  {
                    initialItems: [],
                    updateType: AddressListUpdateType.None,
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
      allowedAdaptersPerManagerPolicy,
      addressListRegistryPerUserPolicyArgs({
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
      await allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, user),
    ).toMatchFunctionOutput(allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser, []);

    // Assert event
    assertEvent(receipt, allowedAdaptersPerManagerPolicy.abi.getEvent('ListsSetForFundAndUser'), {
      comptrollerProxy,
      user,
      listIds: [],
    });
  });
});
