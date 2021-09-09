/*
 * @file Uses the AllowedDepositRecipientsPolicy to test the shared functionality of an AddressListRegistryPolicyBase
 */

import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addressListRegistryPolicyArgs,
  AllowedDepositRecipientsPolicy,
  StandardToken,
  policyManagerConfigArgs,
  AddressListRegistry,
  AddressListUpdateType,
} from '@enzymefinance/protocol';
import { assertEvent, createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('addFundSettings', () => {
  let fundOwner: SignerWithAddress;
  let addressListRegistry: AddressListRegistry, allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;
  let denominationAsset: StandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    addressListRegistry = fork.deployment.addressListRegistry;
    allowedDepositRecipientsPolicy = fork.deployment.allowedDepositRecipientsPolicy;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
  });

  it('cannot be called by a random user', async () => {
    await expect(allowedDepositRecipientsPolicy.addFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('happy path: new lists only', async () => {
    const list1UpdateType = AddressListUpdateType.AddAndRemove;
    const list1Item = randomAddress();
    const list1Id = await addressListRegistry.getListCount();

    const list2UpdateType = AddressListUpdateType.None;
    const list2Item = randomAddress();
    const list2Id = list1Id.add(1);

    const { comptrollerProxy, receipt, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            newListsArgs: [
              {
                updateType: list1UpdateType,
                initialItems: [list1Item],
              },
              {
                updateType: list2UpdateType,
                initialItems: [list2Item],
              },
            ],
          }),
        ],
      }),
    });

    // Assert local state
    expect(await allowedDepositRecipientsPolicy.getListIdsForFund(comptrollerProxy)).toMatchFunctionOutput(
      allowedDepositRecipientsPolicy.getListIdsForFund,
      [list1Id, list2Id],
    );

    // Assert AddressListRegistry state
    expect(await addressListRegistry.getListOwner(list1Id)).toMatchAddress(vaultProxy);
    expect(await addressListRegistry.getListUpdateType(list1Id)).toEqBigNumber(list1UpdateType);
    expect(await addressListRegistry.isInList(list1Id, list1Item)).toBe(true);

    expect(await addressListRegistry.getListOwner(list2Id)).toMatchAddress(vaultProxy);
    expect(await addressListRegistry.getListUpdateType(list2Id)).toEqBigNumber(list2UpdateType);
    expect(await addressListRegistry.isInList(list2Id, list2Item)).toBe(true);

    // Assert event
    assertEvent(receipt, allowedDepositRecipientsPolicy.abi.getEvent('ListsSetForFund'), {
      comptrollerProxy,
      listIds: [list1Id, list2Id],
    });
  });

  it('happy path: existing list', async () => {
    // It does not matter whether or not lists actually exist
    const existingListIds = [0, 1, 2];

    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds,
          }),
        ],
      }),
    });

    // Assert local state
    expect(await allowedDepositRecipientsPolicy.getListIdsForFund(comptrollerProxy)).toMatchFunctionOutput(
      allowedDepositRecipientsPolicy.getListIdsForFund,
      existingListIds,
    );

    // Assert event
    assertEvent(receipt, allowedDepositRecipientsPolicy.abi.getEvent('ListsSetForFund'), {
      comptrollerProxy,
      listIds: existingListIds,
    });
  });

  it('happy path: new list and existing list', async () => {
    const newListId = await addressListRegistry.getListCount();
    const existingListId = constants.MaxUint256; // Use max uint as arbitrary list id

    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [existingListId],
            newListsArgs: [
              {
                updateType: AddressListUpdateType.None,
                initialItems: [],
              },
            ],
          }),
        ],
      }),
    });

    // Assert local state
    expect(await allowedDepositRecipientsPolicy.getListIdsForFund(comptrollerProxy)).toMatchFunctionOutput(
      allowedDepositRecipientsPolicy.getListIdsForFund,
      [existingListId, newListId],
    );

    // Assert event
    assertEvent(receipt, allowedDepositRecipientsPolicy.abi.getEvent('ListsSetForFund'), {
      comptrollerProxy,
      listIds: [existingListId, newListId],
    });
  });
});
