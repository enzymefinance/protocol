import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  ParaSwapV4Adapter,
  ParaSwapV4Path,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  paraSwapV4TakeOrderArgs,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { utils } from 'ethers';

// ParaSwapV4Path
export function paraSwapV4GenerateDummyPaths({ toTokens }: { toTokens: AddressLike[] }) {
  return toTokens.map((toToken) => {
    return {
      // Not supported in our protocol
      routes: [],

      to: toToken,
      totalNetworkFee: 0, // Can ignore this param in the dummy
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
    expectedIncomingAssetAmount,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    paths,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraSwapV4Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
