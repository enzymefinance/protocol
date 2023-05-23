import type { AddressLike } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  IntegrationManager,
  ITestStandardToken,
  PoolTogetherV4Adapter,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  IntegrationManagerActionId,
  lendSelector,
  poolTogetherV4ClaimRewardsArgs,
  poolTogetherV4LendArgs,
  poolTogetherV4RedeemArgs,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { utils } from 'ethers';

export async function poolTogetherV4Lend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  poolTogetherV4Adapter,
  ptToken,
  amount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  poolTogetherV4Adapter: PoolTogetherV4Adapter;
  ptToken: ITestStandardToken;
  amount?: BigNumberish;
}) {
  const lendArgs = poolTogetherV4LendArgs({
    amount,
    ptToken,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: poolTogetherV4Adapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function poolTogetherV4Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  poolTogetherV4Adapter,
  ptToken,
  amount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  poolTogetherV4Adapter: PoolTogetherV4Adapter;
  ptToken: ITestStandardToken;
  amount?: BigNumberish;
}) {
  const redeemArgs = poolTogetherV4RedeemArgs({
    amount,
    ptToken,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: poolTogetherV4Adapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}

export async function poolTogetherV4ClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  poolTogetherV4Adapter,
  prizeDistributor,
  drawIds,
  winningPicks,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  poolTogetherV4Adapter: PoolTogetherV4Adapter;
  prizeDistributor: AddressLike;
  drawIds: BigNumberish[];
  winningPicks: BytesLike;
}) {
  const claimRewardsArgs = poolTogetherV4ClaimRewardsArgs({
    drawIds,
    prizeDistributor,
    winningPicks,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: poolTogetherV4Adapter,
    encodedCallArgs: claimRewardsArgs,
    selector: claimRewardsSelector,
  });

  const claimTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return claimTx;
}
