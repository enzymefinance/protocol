import type { AddressLike } from '@enzymefinance/ethers';
import type { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  ITestStandardToken,
  SynthetixAdapter,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  encodeArgs,
  IntegrationManagerActionId,
  redeemSelector,
  synthetixAssignExchangeDelegateSelector,
  synthetixRedeemArgs,
  synthetixTakeOrderArgs,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { BigNumberish, Signer } from 'ethers';
import { utils } from 'ethers';

import { seedAccount } from '../../../accounts';

export async function synthetixAssignExchangeDelegate({
  comptrollerProxy,
  synthetixDelegateApprovals,
  fundOwner,
  delegate,
}: {
  comptrollerProxy: ComptrollerLib;
  synthetixDelegateApprovals: AddressLike;
  fundOwner: Signer;
  delegate: AddressLike;
}) {
  await comptrollerProxy
    .connect(fundOwner)
    .vaultCallOnContract(
      synthetixDelegateApprovals,
      synthetixAssignExchangeDelegateSelector,
      encodeArgs(['address'], [delegate]),
    );
}

export async function synthetixRedeem({
  comptrollerProxy,
  integrationManager,
  signer,
  synthetixAdapter,
  synths,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: Signer;
  synthetixAdapter: SynthetixAdapter;
  synths: AddressLike[];
}) {
  const redeemArgs = synthetixRedeemArgs({
    synths,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: synthetixAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function synthetixTakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  synthetixAdapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  minIncomingSusdAmount = utils.parseEther('1'),
  provider,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  provider: EthereumTestnetProvider;
  synthetixAdapter: SynthetixAdapter;
  outgoingAsset: ITestStandardToken;
  outgoingAssetAmount?: BigNumberish;
  minIncomingSusdAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    await seedAccount({ account: vaultProxy, amount: outgoingAssetAmount, provider, token: outgoingAsset });
  }

  const takeOrderArgs = synthetixTakeOrderArgs({
    minIncomingSusdAmount,
    outgoingAsset,
    outgoingAssetAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: synthetixAdapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
