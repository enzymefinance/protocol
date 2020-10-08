import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, Signer, utils } from 'ethers';
import { IERC20 } from '../../../../../codegen/IERC20';
import {
  ComptrollerLib,
  IntegrationManager,
  KyberAdapter,
  VaultLib,
} from '../../../../../utils/contracts';
import { encodeArgs } from '../../../common';
import {
  callOnIntegrationArgs,
  callOnIntegrationSelector,
  takeOrderSelector,
} from './common';

export async function kyberTakeOrderArgs({
  incomingAsset,
  minIncomingAssetAmount,
  outgoingAsset,
  outgoingAssetAmount,
}: {
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'address', 'uint256'],
    [incomingAsset, minIncomingAssetAmount, outgoingAsset, outgoingAssetAmount],
  );
}

export async function kyberTakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  kyberAdapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  kyberAdapter: KyberAdapter;
  outgoingAsset: IERC20;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: IERC20;
  minIncomingAssetAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough outgoingAsset for the tx
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
  }

  const takeOrderArgs = await kyberTakeOrderArgs({
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: minIncomingAssetAmount,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount: outgoingAssetAmount,
  });
  const callArgs = await callOnIntegrationArgs({
    adapter: kyberAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  const takeOrderTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(takeOrderTx).resolves.toBeReceipt();

  return takeOrderTx;
}
