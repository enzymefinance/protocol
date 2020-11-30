import { BigNumberish, constants, utils } from 'ethers';
import { SignerWithAddress } from '@crestproject/crestproject';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  ParaSwapAdapter,
  ParaswapPath,
  paraswapTakeOrderArgs,
  StandardToken,
  takeOrderSelector,
} from '@melonproject/protocol';

// ParaswapPath
export function paraswapGenerateMockPaths(totalNetworkFees: BigNumberish[] = [0]) {
  return totalNetworkFees.map((totalNetworkFee) => {
    return {
      to: constants.AddressZero,
      totalNetworkFee, // Only this param will actually be used in the mocks
      routes: [],
    };
  });
}

export async function paraswapTakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  paraswapAdapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
  expectedIncomingAssetAmount = minIncomingAssetAmount,
  paths,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  paraswapAdapter: ParaSwapAdapter;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
  minIncomingAssetAmount?: BigNumberish;
  expectedIncomingAssetAmount?: BigNumberish;
  paths: ParaswapPath[];
}) {
  const takeOrderArgs = paraswapTakeOrderArgs({
    incomingAsset,
    minIncomingAssetAmount,
    expectedIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    paths,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraswapAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
