import { AddressLike, Call, Contract, contract } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  StandardToken,
  ComptrollerLib,
  IntegrationManager,
  KyberAdapter,
  VaultLib,
  callOnIntegrationArgs,
  takeOrderSelector,
  kyberTakeOrderArgs,
  IntegrationManagerActionId,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish, utils } from 'ethers';

// prettier-ignore
export interface KyberNetworkProxy extends Contract<KyberNetworkProxy> {
  getExpectedRate: Call<(src: AddressLike, dest: AddressLike, srcQty: BigNumberish) => { expectedRate: BigNumber, worstRate: BigNumber }, KyberNetworkProxy>
}

export const KyberNetworkProxy = contract<KyberNetworkProxy>()`
  function getExpectedRate(address src, address dest, uint256 srcQty) view returns (uint256 expectedRate, uint256 worstRate)
`;

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
  fundOwner: SignerWithAddress;
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

  const takeOrderArgs = kyberTakeOrderArgs({
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: minIncomingAssetAmount,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount: outgoingAssetAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: kyberAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
