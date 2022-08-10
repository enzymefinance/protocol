import type { AddressLike } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  IntegrationManager,
  ITestStandardToken,
  ParaSwapV5Adapter,
  ParaSwapV5Path,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  paraSwapV5TakeOrderArgs,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { utils } from 'ethers';

// ParaSwapV5Path
export function paraSwapV5GenerateDummyPaths({ toTokens }: { toTokens: AddressLike[] }) {
  return toTokens.map((toToken) => {
    return {
      // Not supported in our protocol
      adapters: [],

      to: toToken,
      totalNetworkFee: 0, // Can ignore this param in the dummy
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
  outgoingAsset: ITestStandardToken;
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount?: BigNumberish;
  expectedIncomingAssetAmount?: BigNumberish;
  uuid?: BytesLike;
  paths: ParaSwapV5Path[];
}) {
  const takeOrderArgs = paraSwapV5TakeOrderArgs({
    expectedIncomingAssetAmount,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    paths,
    uuid,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraSwapV5Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
