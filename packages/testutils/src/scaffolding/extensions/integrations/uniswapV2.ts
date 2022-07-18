import type { AddressLike } from '@enzymefinance/ethers';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  ITestStandardToken,
  UniswapV2ExchangeAdapter,
  UniswapV2LiquidityAdapter,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  takeOrderSelector,
  uniswapV2LendArgs,
  uniswapV2RedeemArgs,
  uniswapV2TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

import { seedAccount } from '../../../accounts';

export async function uniswapV2Lend({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  uniswapV2LiquidityAdapter,
  tokenA,
  tokenB,
  amountADesired,
  amountBDesired,
  amountAMin,
  amountBMin,
  minPoolTokenAmount,
  provider,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2LiquidityAdapter: UniswapV2LiquidityAdapter;
  tokenA: ITestStandardToken;
  tokenB: ITestStandardToken;
  amountADesired: BigNumberish;
  amountBDesired: BigNumberish;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
  minPoolTokenAmount: BigNumberish;
  provider: EthereumTestnetProvider;
  seedFund?: boolean;
}) {
  if (seedFund) {
    await seedAccount({ account: vaultProxy, amount: amountADesired, provider, token: tokenA });
    await seedAccount({ account: vaultProxy, amount: amountBDesired, provider, token: tokenB });
  }

  const lendArgs = uniswapV2LendArgs({
    amountADesired,
    amountAMin,
    amountBDesired,
    amountBMin,
    minPoolTokenAmount,
    tokenA,
    tokenB,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV2LiquidityAdapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  await expect(lendTx).resolves.toBeReceipt();

  return lendTx;
}

export async function uniswapV2Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  uniswapV2LiquidityAdapter,
  poolTokenAmount,
  tokenA,
  tokenB,
  amountAMin,
  amountBMin,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2LiquidityAdapter: UniswapV2LiquidityAdapter;
  poolTokenAmount: BigNumberish;
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
}) {
  const redeemArgs = uniswapV2RedeemArgs({
    amountAMin,
    amountBMin,
    poolTokenAmount,
    tokenA,
    tokenB,
  });
  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV2LiquidityAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  await expect(redeemTx).resolves.toBeReceipt();

  return redeemTx;
}

export async function uniswapV2TakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  uniswapV2ExchangeAdapter,
  path,
  outgoingAssetAmount,
  minIncomingAssetAmount,
  seedFund = false,
  provider,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2ExchangeAdapter: UniswapV2ExchangeAdapter;
  path: ITestStandardToken[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
  seedFund?: boolean;
  provider: EthereumTestnetProvider;
}) {
  if (seedFund) {
    await seedAccount({ account: vaultProxy, amount: outgoingAssetAmount, provider, token: path[0] });
  }

  const takeOrderArgs = uniswapV2TakeOrderArgs({
    minIncomingAssetAmount,
    outgoingAssetAmount,
    path,
  });
  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV2ExchangeAdapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
