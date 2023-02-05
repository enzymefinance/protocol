import type { AddressLike } from '@enzymefinance/ethers';
import type {
  ArbitraryTokenPhasedSharesWrapperFactory,
  GatedRedemptionQueueSharesWrapperFactory,
  GatedRedemptionQueueSharesWrapperRedemptionWindowConfig,
} from '@enzymefinance/protocol';
import { ArbitraryTokenPhasedSharesWrapperLib, GatedRedemptionQueueSharesWrapperLib } from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

import { assertEvent } from '../../assertions';

// ArbitraryTokenPhasedSharesWrapper

export enum ArbitraryTokenPhasedSharesWrapperState {
  Deposit = '0',
  Locked = '1',
  Redeem = '2',
}

export async function deployArbitraryTokenPhasedSharesWrapper({
  signer,
  sharesWrapperFactory,
  vaultProxy,
  depositToken,
  allowedDepositorListId,
  transfersAllowed,
  totalDepositMax,
  feeRecipient,
  feeBps,
  feeExcludesDepositTokenPrincipal,
  manager,
}: {
  signer: SignerWithAddress;
  sharesWrapperFactory: ArbitraryTokenPhasedSharesWrapperFactory;
  vaultProxy: AddressLike;
  depositToken: AddressLike;
  allowedDepositorListId: BigNumberish;
  transfersAllowed: boolean;
  totalDepositMax: BigNumberish;
  feeRecipient: AddressLike;
  feeBps: BigNumberish;
  feeExcludesDepositTokenPrincipal: boolean;
  manager: AddressLike;
}) {
  const receipt = await sharesWrapperFactory
    .connect(signer)
    .deploy(
      vaultProxy,
      depositToken,
      allowedDepositorListId,
      transfersAllowed,
      totalDepositMax,
      feeRecipient,
      feeBps,
      feeExcludesDepositTokenPrincipal,
      manager,
    );

  // Get the deployed proxy via the validated event
  const proxyDeployedArgs = assertEvent(receipt, 'ProxyDeployed', {
    caller: signer,
    proxy: expect.any(String) as string,
  });
  const sharesWrapper = new ArbitraryTokenPhasedSharesWrapperLib(proxyDeployedArgs.proxy, signer);

  return { receipt, sharesWrapper };
}

// GatedRedemptionQueueSharesWrapper

export async function deployGatedRedemptionQueueSharesWrapper({
  signer,
  sharesWrapperFactory,
  vaultProxy,
  managers,
  redemptionAsset,
  useDepositApprovals,
  useRedemptionApprovals,
  useTransferApprovals,
  redemptionWindowConfig,
}: {
  signer: SignerWithAddress;
  sharesWrapperFactory: GatedRedemptionQueueSharesWrapperFactory;
  vaultProxy: AddressLike;
  managers: AddressLike[];
  redemptionAsset: AddressLike;
  useDepositApprovals: boolean;
  useRedemptionApprovals: boolean;
  useTransferApprovals: boolean;
  redemptionWindowConfig: GatedRedemptionQueueSharesWrapperRedemptionWindowConfig;
}) {
  const receipt = await sharesWrapperFactory
    .connect(signer)
    .deploy(
      vaultProxy,
      managers,
      redemptionAsset,
      useDepositApprovals,
      useRedemptionApprovals,
      useTransferApprovals,
      redemptionWindowConfig,
    );

  // Get the deployed proxy via the validated event
  const proxyDeployedArgs = assertEvent(receipt, 'ProxyDeployed', {
    caller: signer,
    proxy: expect.any(String) as string,
  });
  const sharesWrapper = new GatedRedemptionQueueSharesWrapperLib(proxyDeployedArgs.proxy, signer);

  return { receipt, sharesWrapper };
}
