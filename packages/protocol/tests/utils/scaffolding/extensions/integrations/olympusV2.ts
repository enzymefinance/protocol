import type { ComptrollerLib, IntegrationManager, OlympusV2Adapter } from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  olympusV2StakeArgs,
  olympusV2UnstakeArgs,
  stakeSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

export async function olympusV2Stake({
  comptrollerProxy,
  integrationManager,
  signer,
  olympusV2Adapter,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  olympusV2Adapter: OlympusV2Adapter;
  amount: BigNumberish;
}) {
  const stakeArgs = olympusV2StakeArgs({
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: olympusV2Adapter,
    encodedCallArgs: stakeArgs,
    selector: stakeSelector,
  });

  const stakeTx = comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return stakeTx;
}

export async function olympusV2Unstake({
  comptrollerProxy,
  integrationManager,
  signer,
  olympusV2Adapter,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  olympusV2Adapter: OlympusV2Adapter;
  amount: BigNumberish;
}) {
  const unstakeArgs = olympusV2UnstakeArgs({
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: olympusV2Adapter,
    encodedCallArgs: unstakeArgs,
    selector: unstakeSelector,
  });

  const unstakeTx = comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return unstakeTx;
}
