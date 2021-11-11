import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, IntegrationManager, StandardToken } from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  takeOrderSelector,
  uniswapV3TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { BigNumber, BigNumberish } from 'ethers';

export async function uniswapV3TakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  uniswapV3Adapter,
  pathAddresses,
  pathFees,
  outgoingAssetAmount,
  minIncomingAssetAmount = 1,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV3Adapter: AddressLike;
  pathAddresses: StandardToken[];
  pathFees: BigNumber[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough outgoingAsset for the tx
    const vaultProxy = await comptrollerProxy.getVaultProxy();
    await pathAddresses[0].transfer(vaultProxy, outgoingAssetAmount);
  }

  const takeOrderArgs = uniswapV3TakeOrderArgs({
    minIncomingAssetAmount,
    outgoingAssetAmount,
    pathAddresses,
    pathFees,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV3Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
