import { BigNumberish, Signer } from 'ethers';
import {
  ComptrollerLib,
  IntegrationManager,
  ZeroExV2Adapter,
  VaultLib,
} from '@melonproject/protocol';
import {
  callOnIntegrationArgs,
  integrationManagerActionIds,
  takeOrderSelector,
} from './common';
import {
  SignedZeroExV2Order,
  zeroExV2TakeOrderArgs,
} from '../../../../integrations/zeroExV2';

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
  fundOwner: Signer;
  zeroExV2Adapter: ZeroExV2Adapter;
  signedOrder: SignedZeroExV2Order;
  takerAssetFillAmount: BigNumberish;
}) {
  const takeOrderArgs = await zeroExV2TakeOrderArgs(
    signedOrder,
    takerAssetFillAmount,
  );

  const callArgs = await callOnIntegrationArgs({
    adapter: zeroExV2Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  const takeOrderTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );

  await expect(takeOrderTx).resolves.toBeReceipt();

  return takeOrderTx;
}
