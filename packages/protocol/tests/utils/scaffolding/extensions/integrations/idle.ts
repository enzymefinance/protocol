import type { ComptrollerLib, IdleAdapter, IntegrationManager, ITestStandardToken } from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  idleClaimRewardsArgs,
  idleLendArgs,
  idleRedeemArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

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
  idleToken: ITestStandardToken;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    encodedCallArgs: idleClaimRewardsArgs({
      idleToken,
    }),
    selector: claimRewardsSelector,
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
  idleToken: ITestStandardToken;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingIdleTokenAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    encodedCallArgs: idleLendArgs({
      idleToken,
      minIncomingIdleTokenAmount,
      outgoingUnderlyingAmount,
    }),
    selector: lendSelector,
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
  idleToken: ITestStandardToken;
  outgoingIdleTokenAmount: BigNumberish;
  minIncomingUnderlyingAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    encodedCallArgs: idleRedeemArgs({
      idleToken,
      minIncomingUnderlyingAmount,
      outgoingIdleTokenAmount,
    }),
    selector: redeemSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
