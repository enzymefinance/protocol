import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  ComptrollerLib,
  IdleAdapter,
  idleClaimRewardsArgs,
  idleLendArgs,
  idleRedeemArgs,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish } from 'ethers';

export async function idleClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: claimRewardsSelector,
    encodedCallArgs: idleClaimRewardsArgs({
      idleToken,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  outgoingUnderlyingAmount,
  minIncomingIdleTokenAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingIdleTokenAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: lendSelector,
    encodedCallArgs: idleLendArgs({
      idleToken,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  outgoingIdleTokenAmount,
  minIncomingUnderlyingAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  outgoingIdleTokenAmount: BigNumberish;
  minIncomingUnderlyingAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: redeemSelector,
    encodedCallArgs: idleRedeemArgs({
      idleToken,
      outgoingIdleTokenAmount,
      minIncomingUnderlyingAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
