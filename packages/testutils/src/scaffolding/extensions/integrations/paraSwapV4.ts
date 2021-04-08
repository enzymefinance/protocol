import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  ParaSwapV4Adapter,
  ParaSwapV4Path,
  paraSwapV4TakeOrderArgs,
  StandardToken,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import { BigNumberish, utils } from 'ethers';

// ParaSwapV4Path
export function paraSwapV4GenerateDummyPaths({ toTokens }: { toTokens: AddressLike[] }) {
  return toTokens.map((toToken) => {
    return {
      to: toToken,
      totalNetworkFee: 0, // Not supported in our protocol
      routes: [], // Can ignore this param in the dummy
    };
  });
}

export async function paraSwapV4TakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  paraSwapV4Adapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  minIncomingAssetAmount = 1,
  expectedIncomingAssetAmount = minIncomingAssetAmount,
  paths,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  paraSwapV4Adapter: ParaSwapV4Adapter;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  minIncomingAssetAmount?: BigNumberish;
  expectedIncomingAssetAmount?: BigNumberish;
  paths: ParaSwapV4Path[];
}) {
  const takeOrderArgs = paraSwapV4TakeOrderArgs({
    minIncomingAssetAmount,
    expectedIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    paths,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraSwapV4Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
