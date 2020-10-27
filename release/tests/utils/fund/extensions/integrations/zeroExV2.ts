import { BigNumberish, Signer } from 'ethers';
import {
  ComptrollerLib,
  IntegrationManager,
  ZeroExV2Adapter,
  VaultLib,
} from '../../../../../utils/contracts';
import {
  SignedZeroExV2Order,
  zeroExV2TakeOrderArgs,
} from '../../../../../utils/integrations/zeroExV2';
import {
  callOnIntegrationArgs,
  integrationManagerActionIds,
  takeOrderSelector,
} from './common';

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
