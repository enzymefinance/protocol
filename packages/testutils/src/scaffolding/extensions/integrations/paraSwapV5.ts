import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  ParaSwapV5Adapter,
  ParaSwapV5Path,
  paraSwapV5TakeOrderArgs,
  StandardToken,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import { BigNumberish, BytesLike, utils } from 'ethers';

// ParaSwapV5Path
export function paraSwapV5GenerateDummyPaths({ toTokens }: { toTokens: AddressLike[] }) {
  return toTokens.map((toToken) => {
    return {
      to: toToken,
      totalNetworkFee: 0, // Not supported in our protocol
      adapters: [], // Can ignore this param in the dummy
    };
  });
}

export async function paraSwapV5TakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  paraSwapV5Adapter,
  outgoingAsset,
  outgoingAssetAmount,
  minIncomingAssetAmount = 1,
  expectedIncomingAssetAmount = minIncomingAssetAmount,
  uuid = utils.randomBytes(16),
  paths,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  paraSwapV5Adapter: ParaSwapV5Adapter;
  outgoingAsset: StandardToken;
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount?: BigNumberish;
  expectedIncomingAssetAmount?: BigNumberish;
  uuid?: BytesLike;
  paths: ParaSwapV5Path[];
}) {
  const takeOrderArgs = paraSwapV5TakeOrderArgs({
    minIncomingAssetAmount,
    expectedIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    uuid,
    paths,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraSwapV5Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
