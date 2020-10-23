import { AddressLike } from '@crestproject/crestproject';
import { contract, Call, Contract } from '@crestproject/ethers';
import { StandardToken } from '@melonproject/utils';
import { BigNumber, BigNumberish, Signer, utils } from 'ethers';
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

// prettier-ignore
export interface IKyberNetworkProxy extends Contract<IKyberNetworkProxy> {
  getExpectedRate: Call<(src: AddressLike, dest: AddressLike, srcQty: BigNumberish) => { expectedRate: BigNumber, worstRate: BigNumber }, IKyberNetworkProxy>
}

export const IKyberNetworkProxy = contract.fromSignatures<IKyberNetworkProxy>`
  function getExpectedRate(address src, address dest, uint256 srcQty) view returns (uint256 expectedRate, uint256 worstRate)
`;

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
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
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
