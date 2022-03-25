import type { AddressLike, Call, Contract, Send } from '@enzymefinance/ethers';
import { contract } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  StandardToken,
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

export interface UniswapV2Factory extends Contract<UniswapV2Factory> {
  createPair: Send<(_token0: AddressLike, _token1: AddressLike) => AddressLike>;
  getPair: Call<(_token0: AddressLike, _token1: AddressLike) => AddressLike>;
}

export const UniswapV2Factory = contract<UniswapV2Factory>()`
  function createPair(address,address) returns (address)
  function getPair(address,address) view returns (address)
`;

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
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2LiquidityAdapter: UniswapV2LiquidityAdapter;
  tokenA: StandardToken;
  tokenB: StandardToken;
  amountADesired: BigNumberish;
  amountBDesired: BigNumberish;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
  minPoolTokenAmount: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough tokenA and tokenB for the tx
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
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
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2ExchangeAdapter: UniswapV2ExchangeAdapter;
  path: StandardToken[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough outgoingAsset for the tx
    await path[0].transfer(vaultProxy, outgoingAssetAmount);
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
