import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, Signer, utils } from 'ethers';
import {
  KyberAdapter,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '../../../../utils/contracts';
import { IERC20 } from '../../../../codegen/IERC20';
import { encodeArgs } from '../../common';
import {
  callOnIntegrationArgs,
  callOnIntegrationSelector,
  takeOrderSelector,
} from './common';

export async function kyberTakeOrderArgs(
  incomingAsset: AddressLike,
  expectedIncomingAssetAmount: BigNumberish,
  outgoingAsset: AddressLike,
  outgoingAssetAmount: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'address', 'uint256'],
    [
      incomingAsset,
      expectedIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    ],
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

  const takeOrderArgs = await kyberTakeOrderArgs(
    incomingAsset,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
  );
  const callArgs = await callOnIntegrationArgs(
    kyberAdapter,
    takeOrderSelector,
    takeOrderArgs,
  );

  const takeOrderTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(takeOrderTx).resolves.toBeReceipt();

  return takeOrderTx;
}
