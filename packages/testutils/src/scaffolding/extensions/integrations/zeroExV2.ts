import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  SignedZeroExV2Order,
  VaultLib,
  ZeroExV2Adapter,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  takeOrderSelector,
  zeroExV2TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

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
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
