import { Call } from '@enzymefinance/ethers';
import { BytesLike, utils } from 'ethers';
import { encodeArgs } from '../encoding';
import { sighash } from '../sighash';

export enum SpendAssetsHandleType {
  None,
  Approve,
  Transfer,
  Remove,
}

export const addTrackedAssetsFragment = utils.FunctionFragment.fromString('addTrackedAssets(address,bytes,bytes)');
export const approveAssetsFragment = utils.FunctionFragment.fromString('approveAssets(address,bytes,bytes)');
export const claimRewardsAndReinvestFragment = utils.FunctionFragment.fromString(
  'claimRewardsAndReinvest(address,bytes,bytes)',
);
export const claimRewardsAndSwapFragment = utils.FunctionFragment.fromString(
  'claimRewardsAndSwap(address,bytes,bytes)',
);
export const claimRewardsFragment = utils.FunctionFragment.fromString('claimRewards(address,bytes,bytes)');
export const lendFragment = utils.FunctionFragment.fromString('lend(address,bytes,bytes)');
export const lendAndStakeFragment = utils.FunctionFragment.fromString('lendAndStake(address,bytes,bytes)');
export const redeemFragment = utils.FunctionFragment.fromString('redeem(address,bytes,bytes)');
export const removeTrackedAssetsFragment = utils.FunctionFragment.fromString(
  'removeTrackedAssets(address,bytes,bytes)',
);
export const stakeFragment = utils.FunctionFragment.fromString('stake(address,bytes,bytes)');
export const takeOrderFragment = utils.FunctionFragment.fromString('takeOrder(address,bytes,bytes)');
export const unstakeFragment = utils.FunctionFragment.fromString('unstake(address,bytes,bytes)');
export const unstakeAndRedeemFragment = utils.FunctionFragment.fromString('unstakeAndRedeem(address,bytes,bytes)');

export const addTrackedAssetsSelector = sighash(addTrackedAssetsFragment);
export const approveAssetsSelector = sighash(approveAssetsFragment);
export const claimRewardsAndReinvestSelector = sighash(claimRewardsAndReinvestFragment);
export const claimRewardsAndSwapSelector = sighash(claimRewardsAndSwapFragment);
export const claimRewardsSelector = sighash(claimRewardsFragment);
export const lendSelector = sighash(lendFragment);
export const lendAndStakeSelector = sighash(lendAndStakeFragment);
export const redeemSelector = sighash(redeemFragment);
export const removeTrackedAssetsSelector = sighash(removeTrackedAssetsFragment);
export const stakeSelector = sighash(stakeFragment);
export const takeOrderSelector = sighash(takeOrderFragment);
export const unstakeSelector = sighash(unstakeFragment);
export const unstakeAndRedeemSelector = sighash(unstakeAndRedeemFragment);

// prettier-ignore
export interface IntegrationAdapterInterface {
  parseAssetsForMethod: Call<(selector: BytesLike, encodedCallArgs: BytesLike) => any>;
}

export async function assetTransferArgs({
  adapter,
  selector,
  encodedCallArgs,
}: {
  adapter: IntegrationAdapterInterface;
  selector: BytesLike;
  encodedCallArgs: BytesLike;
}) {
  const {
    0: spendAssetsHandleType,
    1: spendAssets,
    2: spendAssetAmounts,
    3: expectedIncomingAssets,
  } = await adapter.parseAssetsForMethod(selector, encodedCallArgs);

  return encodeArgs(
    ['uint', 'address[]', 'uint[]', 'address[]'],
    [spendAssetsHandleType, spendAssets, spendAssetAmounts, expectedIncomingAssets],
  );
}
