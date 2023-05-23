import { randomAddress } from '@enzymefinance/ethers';
import type { AddressListRegistry, ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  addressListRegistryAddToListSelector,
  addressListRegistryAttestListsSelector,
  addressListRegistryRemoveFromListSelector,
  addressListRegistrySetListOwnerSelector,
  addressListRegistrySetListUpdateTypeSelector,
  AddressListUpdateType,
  encodeArgs,
  ITestStandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import { assertEvent, createNewFund, deployProtocolFixture, vaultCallCreateNewList } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

let addressListRegistry: AddressListRegistry,
  comptrollerProxy: ComptrollerLib,
  fork: ProtocolDeployment,
  fundOwner: SignerWithAddress,
  listId: BigNumberish,
  testAddress: string,
  vaultProxy: VaultLib;

beforeAll(async () => {
  fork = await deployProtocolFixture();

  [fundOwner] = fork.accounts;
  const newFundRes = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  addressListRegistry = fork.deployment.addressListRegistry;
  comptrollerProxy = newFundRes.comptrollerProxy;
  testAddress = randomAddress();
  vaultProxy = newFundRes.vaultProxy;
});

it('creates a list with the vaultProxy as owner', async () => {
  listId = await vaultCallCreateNewList({
    addressListRegistry,
    comptrollerProxy,
    items: [],
    owner: vaultProxy,
    signer: fundOwner,
    updateType: AddressListUpdateType.AddAndRemove,
  });

  expect(await addressListRegistry.getListOwner(listId)).toMatchAddress(vaultProxy);
});

it('attests to newly-created list', async () => {
  const description = 'test';
  const args = encodeArgs(['uint256[]', 'string[]'], [[listId], [description]]);

  const receipt = await comptrollerProxy
    .connect(fundOwner)
    .vaultCallOnContract(addressListRegistry, addressListRegistryAttestListsSelector, args);

  assertEvent(receipt, addressListRegistry.abi.getEvent('ListAttested'), {
    description,
    id: listId,
  });
});

it('adds item to list', async () => {
  const args = encodeArgs(['uint256', 'address[]'], [listId, [testAddress]]);

  await comptrollerProxy
    .connect(fundOwner)
    .vaultCallOnContract(addressListRegistry, addressListRegistryAddToListSelector, args);

  expect(await addressListRegistry.isInList(listId, testAddress)).toBe(true);
});

it('removes item from list', async () => {
  const args = encodeArgs(['uint256', 'address[]'], [listId, [testAddress]]);

  await comptrollerProxy
    .connect(fundOwner)
    .vaultCallOnContract(addressListRegistry, addressListRegistryRemoveFromListSelector, args);

  expect(await addressListRegistry.isInList(listId, testAddress)).toBe(false);
});

it('edits list update type', async () => {
  const updateType = AddressListUpdateType.None;
  const args = encodeArgs(['uint256', 'uint8'], [listId, updateType]);

  await comptrollerProxy
    .connect(fundOwner)
    .vaultCallOnContract(addressListRegistry, addressListRegistrySetListUpdateTypeSelector, args);

  expect((await addressListRegistry.getListUpdateType(listId)).toString()).toBe(updateType);
});

it('sets new list owner', async () => {
  const args = encodeArgs(['uint256', 'address'], [listId, testAddress]);

  await comptrollerProxy
    .connect(fundOwner)
    .vaultCallOnContract(addressListRegistry, addressListRegistrySetListOwnerSelector, args);

  expect(await addressListRegistry.getListOwner(listId)).toMatchAddress(testAddress);
});
