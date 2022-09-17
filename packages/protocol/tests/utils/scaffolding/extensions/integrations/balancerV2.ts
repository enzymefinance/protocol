import type { AddressLike } from '@enzymefinance/ethers';
import type {
  BalancerV2LiquidityAdapter,
  BalancerV2PoolBalanceChange,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  balancerV2LendArgs,
  balancerV2RedeemArgs,
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  ITestBalancerV2Vault,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import { setAccountBalance } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';

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
