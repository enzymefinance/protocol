import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  IntegrationManager,
  ZeroExV2Adapter,
  VaultLib,
  SignedZeroExV2Order,
  callOnIntegrationArgs,
  takeOrderSelector,
  zeroExV2TakeOrderArgs,
  IntegrationManagerActionId,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';

export async function zeroExV2TakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  zeroExV2Adapter,
  signedOrder,
  takerAssetFillAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  zeroExV2Adapter: ZeroExV2Adapter;
  signedOrder: SignedZeroExV2Order;
  takerAssetFillAmount: BigNumberish;
}) {
  const takeOrderArgs = zeroExV2TakeOrderArgs({
    signedOrder,
    takerAssetFillAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: zeroExV2Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
