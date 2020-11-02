import { BigNumberish, BytesLike, utils } from 'ethers';
import { AddressLike, SignerWithAddress } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  MockGenericAdapter,
  StandardToken,
  sighash,
  callOnIntegrationArgs,
  encodeArgs,
  IntegrationManagerActionId,
} from '@melonproject/protocol';

export const mockGenericSwapASelector = sighash(utils.FunctionFragment.fromString('swapA(address,bytes,bytes)'));

export const mockGenericSwapBSelector = sighash(utils.FunctionFragment.fromString('swapB(address,bytes,bytes)'));

export const mockGenericSwapCSelector = sighash(utils.FunctionFragment.fromString('swapC(address,bytes,bytes)'));

export function mockGenericSwapArgs({
  spendAssets,
  spendAssetAmounts,
  incomingAssets,
  minIncomingAssetAmounts,
  incomingAssetAmounts,
}: {
  spendAssets: AddressLike[];
  spendAssetAmounts: BigNumberish[];
  incomingAssets: AddressLike[];
  minIncomingAssetAmounts: BigNumberish[];
  incomingAssetAmounts: BigNumberish[];
}) {
  return encodeArgs(
    ['address[]', 'uint256[]', 'address[]', 'uint256[]', 'uint256[]'],
    [spendAssets, spendAssetAmounts, incomingAssets, minIncomingAssetAmounts, incomingAssetAmounts],
  );
}

export async function mockGenericSwap({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  mockGenericAdapter,
  selector = mockGenericSwapASelector,
  spendAssets = [],
  spendAssetAmounts = [],
  incomingAssets = [],
  minIncomingAssetAmounts = [],
  actualIncomingAssetAmounts = [],
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  mockGenericAdapter: MockGenericAdapter;
  selector?: BytesLike;
  spendAssets?: StandardToken[];
  spendAssetAmounts?: BigNumberish[];
  incomingAssets?: StandardToken[];
  minIncomingAssetAmounts?: BigNumberish[];
  actualIncomingAssetAmounts?: BigNumberish[];
  seedFund?: boolean;
}) {
  // Seed the VaultProxy with enough spendAssets for the tx
  if (seedFund) {
    for (const key in spendAssets) {
      await spendAssets[key].transfer(vaultProxy, spendAssetAmounts[key]);
    }
  }

  const swapArgs = mockGenericSwapArgs({
    spendAssets,
    spendAssetAmounts,
    incomingAssets,
    minIncomingAssetAmounts,
    incomingAssetAmounts: actualIncomingAssetAmounts,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: mockGenericAdapter,
    selector,
    encodedCallArgs: swapArgs,
  });

  const swapTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  await expect(swapTx).resolves.toBeReceipt();

  return swapTx;
}
