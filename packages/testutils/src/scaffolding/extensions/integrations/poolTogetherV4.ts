import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  PoolTogetherV4Adapter,
  poolTogetherV4ClaimRewardsArgs,
  poolTogetherV4LendArgs,
  poolTogetherV4RedeemArgs,
  redeemSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import { BigNumberish, utils, BytesLike } from 'ethers';

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
  ptToken: StandardToken;
  amount?: BigNumberish;
}) {
  const lendArgs = poolTogetherV4LendArgs({
    ptToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: poolTogetherV4Adapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
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
  ptToken: StandardToken;
  amount?: BigNumberish;
}) {
  const redeemArgs = poolTogetherV4RedeemArgs({
    ptToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: poolTogetherV4Adapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
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
    prizeDistributor,
    drawIds,
    winningPicks,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: poolTogetherV4Adapter,
    selector: claimRewardsSelector,
    encodedCallArgs: claimRewardsArgs,
  });

  const claimTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return claimTx;
}
