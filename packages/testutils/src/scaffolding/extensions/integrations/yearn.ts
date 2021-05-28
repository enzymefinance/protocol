import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  StandardToken,
  YearnVaultV2Adapter,
  yearnVaultV2LendArgs,
  yearnVaultV2RedeemArgs,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish } from 'ethers';

export async function yearnVaultV2Lend({
  signer,
  comptrollerProxy,
  integrationManager,
  yearnVaultV2Adapter,
  yVault,
  outgoingUnderlyingAmount,
  minIncomingYVaultSharesAmount = BigNumber.from(1),
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  yearnVaultV2Adapter: YearnVaultV2Adapter;
  yVault: StandardToken;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingYVaultSharesAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: yearnVaultV2Adapter,
    selector: lendSelector,
    encodedCallArgs: yearnVaultV2LendArgs({
      yVault,
      outgoingUnderlyingAmount,
      minIncomingYVaultSharesAmount,
    }),
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function yearnVaultV2Redeem({
  signer,
  comptrollerProxy,
  integrationManager,
  yearnVaultV2Adapter,
  yVault,
  maxOutgoingYVaultSharesAmount,
  minIncomingUnderlyingAmount = BigNumber.from(1),
  slippageToleranceBps = 1,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  yearnVaultV2Adapter: YearnVaultV2Adapter;
  yVault: StandardToken;
  maxOutgoingYVaultSharesAmount: BigNumberish;
  minIncomingUnderlyingAmount?: BigNumberish;
  slippageToleranceBps?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: yearnVaultV2Adapter,
    selector: redeemSelector,
    encodedCallArgs: yearnVaultV2RedeemArgs({
      yVault,
      maxOutgoingYVaultSharesAmount,
      minIncomingUnderlyingAmount,
      slippageToleranceBps,
    }),
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
