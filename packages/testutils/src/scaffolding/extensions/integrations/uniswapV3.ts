import type { AddressLike } from '@enzymefinance/ethers';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, IntegrationManager, ITestStandardToken } from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  takeOrderSelector,
  uniswapV3TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { BigNumber, BigNumberish } from 'ethers';

import { setAccountBalance } from '../../../accounts';

export async function uniswapV3TakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  uniswapV3Adapter,
  pathAddresses,
  pathFees,
  outgoingAssetAmount,
  provider,
  minIncomingAssetAmount = 1,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV3Adapter: AddressLike;
  pathAddresses: ITestStandardToken[];
  pathFees: BigNumber[];
  outgoingAssetAmount: BigNumberish;
  provider: EthereumTestnetProvider;
  minIncomingAssetAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    const vaultProxy = await comptrollerProxy.getVaultProxy();
    await setAccountBalance({ account: vaultProxy, amount: outgoingAssetAmount, provider, token: pathAddresses[0] });
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
