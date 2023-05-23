import type {
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  ZeroExV4Adapter,
  ZeroExV4LimitOrder,
  ZeroExV4RfqOrder,
  ZeroExV4Signature,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  takeOrderSelector,
  ZeroExV4OrderType,
  zeroExV4TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

export async function zeroExV4TakeLimitOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  zeroExV4Adapter,
  order,
  signature,
  takerAssetFillAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  zeroExV4Adapter: ZeroExV4Adapter;
  order: ZeroExV4LimitOrder;
  signature: ZeroExV4Signature;
  takerAssetFillAmount: BigNumberish;
}) {
  const takeOrderArgs = zeroExV4TakeOrderArgs({
    order,
    signature,
    takerAssetFillAmount,
    orderType: ZeroExV4OrderType.Limit,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: zeroExV4Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function zeroExV4TakeRfqOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  zeroExV4Adapter,
  order,
  signature,
  takerAssetFillAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  zeroExV4Adapter: ZeroExV4Adapter;
  order: ZeroExV4RfqOrder;
  signature: ZeroExV4Signature;
  takerAssetFillAmount: BigNumberish;
}) {
  const takeOrderArgs = zeroExV4TakeOrderArgs({
    order,
    signature,
    takerAssetFillAmount,
    orderType: ZeroExV4OrderType.Rfq,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: zeroExV4Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
