import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  StandardToken,
  takeOrderSelector,
  uniswapV3TakeOrderArgs,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish } from 'ethers';

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
    await pathAddresses[0].transfer(await comptrollerProxy.getVaultProxy(), outgoingAssetAmount);
  }

  const takeOrderArgs = uniswapV3TakeOrderArgs({
    pathAddresses,
    pathFees,
    outgoingAssetAmount,
    minIncomingAssetAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV3Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
