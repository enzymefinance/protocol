import { AddressLike, Call, Contract, contract, Send } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  StandardToken,
  takeOrderSelector,
  UniswapV2Adapter,
  uniswapV2LendArgs,
  uniswapV2RedeemArgs,
  uniswapV2TakeOrderArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';

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
  uniswapV2Adapter,
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
  uniswapV2Adapter: UniswapV2Adapter;
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
    tokenA,
    tokenB,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    minPoolTokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV2Adapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
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
  uniswapV2Adapter,
  poolTokenAmount,
  tokenA,
  tokenB,
  amountAMin,
  amountBMin,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2Adapter: UniswapV2Adapter;
  poolTokenAmount: BigNumberish;
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
}) {
  const redeemArgs = uniswapV2RedeemArgs({
    poolTokenAmount,
    tokenA,
    tokenB,
    amountAMin,
    amountBMin,
  });
  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV2Adapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
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
  uniswapV2Adapter,
  path,
  outgoingAssetAmount,
  minIncomingAssetAmount,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  uniswapV2Adapter: UniswapV2Adapter;
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
    path,
    outgoingAssetAmount,
    minIncomingAssetAmount,
  });
  const callArgs = callOnIntegrationArgs({
    adapter: uniswapV2Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
