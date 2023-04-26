import type { AddressLike } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  IntegrationManager,
  ITestStandardToken,
  OneInchV5Adapter,
  OneInchV5TakeOrderArgs,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  oneInchV5TakeMultipleOrdersArgs,
  oneInchV5TakeOrderArgs,
  takeMultipleOrdersSelector,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';

export async function oneInchV5TakeMultipleOrders({
  comptrollerProxy,
  integrationManager,
  signer,
  oneInchV5Adapter,
  orders,
  allowOrdersToFail,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  oneInchV5Adapter: OneInchV5Adapter;
  orders: OneInchV5TakeOrderArgs[];
  allowOrdersToFail: boolean;
}) {
  const ordersData = orders.map(({ orderDescription, data, executor }) =>
    oneInchV5TakeOrderArgs({
      orderDescription,
      data,
      executor,
    }),
  );

  const takeMultipleOrdersArgs = oneInchV5TakeMultipleOrdersArgs({
    ordersData,
    allowOrdersToFail,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: oneInchV5Adapter,
    encodedCallArgs: takeMultipleOrdersArgs,
    selector: takeMultipleOrdersSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function oneInchV5TakeOrder({
  comptrollerProxy,
  data,
  executor,
  flags,
  incomingAsset,
  integrationManager,
  minIncomingAssetAmount,
  oneInchV5Adapter,
  outgoingAsset,
  outgoingAssetAmount,
  signer,
  srcReceiver,
  vaultProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  data: BytesLike;
  executor: AddressLike;
  flags: BigNumberish;
  incomingAsset: AddressLike;
  integrationManager: IntegrationManager;
  minIncomingAssetAmount: BigNumberish;
  oneInchV5Adapter: OneInchV5Adapter;
  outgoingAsset: ITestStandardToken;
  outgoingAssetAmount: BigNumberish;
  signer: SignerWithAddress;
  srcReceiver: AddressLike;
  vaultProxy: AddressLike;
}) {
  const takeOrderArgs = oneInchV5TakeOrderArgs({
    orderDescription: {
      amount: outgoingAssetAmount,
      dstReceiver: vaultProxy,
      dstToken: incomingAsset,
      flags,
      minReturnAmount: minIncomingAssetAmount,
      srcReceiver,
      srcToken: outgoingAsset,
    },
    data,
    executor,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: oneInchV5Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
