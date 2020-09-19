import { AddressLike } from '@crestproject/crestproject';
import { MockGenericAdapter } from '@melonproject/utils/dist/utils/contracts';
import { BigNumberish, BytesLike, Signer, utils } from 'ethers';
import { IERC20 } from '../../../../../codegen/IERC20';
import {
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '../../../../../utils/contracts';
import { encodeArgs, sighash } from '../../../common';
import { callOnIntegrationArgs, callOnIntegrationSelector } from './common';

export const mockGenericSwapASelector = sighash(
  utils.FunctionFragment.fromString('swapA(address,bytes,bytes)'),
);
export const mockGenericSwapBSelector = sighash(
  utils.FunctionFragment.fromString('swapB(address,bytes,bytes)'),
);
export const mockGenericSwapCSelector = sighash(
  utils.FunctionFragment.fromString('swapC(address,bytes,bytes)'),
);

export async function mockGenericSwapArgs(
  spendAssets: AddressLike[],
  spendAssetAmounts: BigNumberish[],
  incomingAssets: AddressLike[],
  minIncomingAssetAmounts: BigNumberish[],
  incomingAssetAmounts: BigNumberish[],
) {
  return encodeArgs(
    ['address[]', 'uint256[]', 'address[]', 'uint256[]', 'uint256[]'],
    [
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      incomingAssetAmounts,
    ],
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
  fundOwner: Signer;
  mockGenericAdapter: MockGenericAdapter;
  selector?: BytesLike;
  spendAssets?: IERC20[];
  spendAssetAmounts?: BigNumberish[];
  incomingAssets?: IERC20[];
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

  const swapArgs = await mockGenericSwapArgs(
    spendAssets,
    spendAssetAmounts,
    incomingAssets,
    minIncomingAssetAmounts,
    actualIncomingAssetAmounts,
  );
  const callArgs = await callOnIntegrationArgs(
    mockGenericAdapter,
    selector,
    swapArgs,
  );

  const swapTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(swapTx).resolves.toBeReceipt();

  return swapTx;
}
