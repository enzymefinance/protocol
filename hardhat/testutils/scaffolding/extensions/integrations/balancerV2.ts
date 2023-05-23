import type { AddressLike } from '@enzymefinance/ethers';
import type {
  BalancerV2BatchSwapStep,
  BalancerV2LiquidityAdapter,
  BalancerV2PoolBalanceChange,
  BalancerV2SwapKind,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  balancerV2ClaimRewardsArgs,
  balancerV2LendAndStakeArgs,
  balancerV2LendArgs,
  balancerV2RedeemArgs,
  balancerV2StakeArgs,
  balancerV2TakeOrderArgs,
  balancerV2UnstakeAndRedeemArgs,
  balancerV2UnstakeArgs,
  callOnIntegrationArgs,
  claimRewardsSelector,
  IntegrationManagerActionId,
  ITestBalancerV2Vault,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  stakeSelector,
  takeOrderSelector,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import { setAccountBalance } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, constants } from 'ethers';

export async function balancerV2ConstructRequest({
  provider,
  balancerVaultAddress,
  poolId,
  limits,
  userData,
  useInternalBalance = false,
}: {
  provider: EthereumTestnetProvider;
  balancerVaultAddress: AddressLike;
  poolId: BytesLike;
  limits: BigNumberish[];
  userData: BytesLike;
  useInternalBalance?: boolean;
}) {
  const poolTokensInfo = await new ITestBalancerV2Vault(balancerVaultAddress, provider).getPoolTokens(poolId);

  return {
    assets: poolTokensInfo.tokens_,
    limits,
    userData,
    useInternalBalance,
  } as BalancerV2PoolBalanceChange;
}

// Individual actions

export function balancerV2ClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  stakingToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  stakingToken: AddressLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs: balancerV2ClaimRewardsArgs({ stakingToken }),
    selector: claimRewardsSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2Lend({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  poolId,
  minIncomingBptAmount,
  spendAssets,
  spendAssetAmounts,
  request,
  provider,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  poolId: BytesLike;
  minIncomingBptAmount: BigNumberish;
  spendAssets: AddressLike[];
  spendAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
  provider?: EthereumTestnetProvider;
  seedFund?: boolean;
}) {
  if (seedFund && provider) {
    for (let i = 0; i < spendAssets.length; i++) {
      await setAccountBalance({
        account: vaultProxy,
        amount: spendAssetAmounts[i],
        provider,
        token: spendAssets[i],
      });
    }
  }

  const lendArgs = balancerV2LendArgs({
    poolId,
    minIncomingBptAmount,
    spendAssets,
    spendAssetAmounts,
    request,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2LendAndStake({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  stakingToken,
  poolId,
  minIncomingBptAmount,
  spendAssets,
  spendAssetAmounts,
  request,
  provider,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  stakingToken: AddressLike;
  poolId: BytesLike;
  minIncomingBptAmount: BigNumberish;
  spendAssets: AddressLike[];
  spendAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
  provider?: EthereumTestnetProvider;
  seedFund?: boolean;
}) {
  if (seedFund && provider) {
    for (let i = 0; i < spendAssets.length; i++) {
      await setAccountBalance({
        account: vaultProxy,
        amount: spendAssetAmounts[i],
        provider,
        token: spendAssets[i],
      });
    }
  }

  const lendAndStakeArgs = balancerV2LendAndStakeArgs({
    stakingToken,
    poolId,
    minIncomingBptAmount,
    spendAssets,
    spendAssetAmounts,
    request,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs: lendAndStakeArgs,
    selector: lendAndStakeSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  poolId,
  bptAmount,
  incomingAssets,
  minIncomingAssetAmounts,
  request,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  poolId: BytesLike;
  bptAmount: BigNumberish;
  incomingAssets: AddressLike[];
  minIncomingAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
}) {
  const redeemArgs = balancerV2RedeemArgs({
    poolId,
    bptAmount,
    incomingAssets,
    minIncomingAssetAmounts,
    request,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2Stake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  stakingToken,
  bptAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  stakingToken: AddressLike;
  bptAmount: BigNumberish;
}) {
  const encodedCallArgs = balancerV2StakeArgs({
    stakingToken,
    bptAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs,
    selector: stakeSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2TakeOrder({
  signer,
  comptrollerProxy,
  integrationManager,
  balancerV2LiquidityAdapter,
  swapKind,
  swaps,
  assets,
  limits,
  stakingTokens = assets.map(() => constants.AddressZero),
  provider,
  seedFund = false,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  swapKind: BalancerV2SwapKind;
  swaps: BalancerV2BatchSwapStep[];
  assets: AddressLike[];
  limits: BigNumberish[];
  stakingTokens?: AddressLike[];
  provider?: EthereumTestnetProvider;
  seedFund?: boolean;
}) {
  if (seedFund && provider) {
    const vaultProxy = await comptrollerProxy.getVaultProxy();

    for (let i = 0; i < assets.length; i++) {
      // `+` limit is a spend asset
      if (limits[i] > BigNumber.from(0)) {
        await setAccountBalance({
          account: vaultProxy,
          amount: limits[i],
          provider,
          token: assets[i],
        });
      }
    }
  }

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: balancerV2TakeOrderArgs({
      swapKind,
      swaps,
      assets,
      limits,
      stakingTokens,
    }),
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2Unstake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  stakingToken,
  bptAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  stakingToken: AddressLike;
  bptAmount: BigNumberish;
}) {
  const encodedCallArgs = balancerV2UnstakeArgs({
    stakingToken,
    bptAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs,
    selector: unstakeSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function balancerV2UnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  balancerV2LiquidityAdapter,
  stakingToken,
  poolId,
  bptAmount,
  incomingAssets,
  minIncomingAssetAmounts,
  request,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
  stakingToken: AddressLike;
  poolId: BytesLike;
  bptAmount: BigNumberish;
  incomingAssets: AddressLike[];
  minIncomingAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
}) {
  const unstakeAndRedeemArgs = balancerV2UnstakeAndRedeemArgs({
    stakingToken,
    poolId,
    bptAmount,
    incomingAssets,
    minIncomingAssetAmounts,
    request,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: balancerV2LiquidityAdapter,
    encodedCallArgs: unstakeAndRedeemArgs,
    selector: unstakeAndRedeemSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
