import { BigNumberish, Signer } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import {
  UniswapV2Adapter,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  StandardToken,
} from '@melonproject/protocol';
import { encodeArgs } from '../../../common';
import {
  callOnIntegrationArgs,
  integrationManagerActionIds,
  lendSelector,
  redeemSelector,
  takeOrderSelector,
} from './common';

export async function uniswapv2TakeOrderArgs({
  path,
  outgoingAssetAmount,
  minIncomingAssetAmount,
}: {
  path: AddressLike[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address[]', 'uint256', 'uint256'],
    [path, outgoingAssetAmount, minIncomingAssetAmount],
  );
}

export async function uniswapV2LendArgs({
  tokenA,
  tokenB,
  amountADesired,
  amountBDesired,
  amountAMin,
  amountBMin,
  incomingAsset,
  minIncomingAssetAmount,
}: {
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountADesired: BigNumberish;
  amountBDesired: BigNumberish;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address[2]', 'uint256[2]', 'uint256[2]', 'address', 'uint256'],
    [
      [tokenA, tokenB],
      [amountADesired, amountBDesired],
      [amountAMin, amountBMin],
      incomingAsset,
      minIncomingAssetAmount,
    ],
  );
}

export async function uniswapv2RedeemArgs({
  outgoingAsset,
  liquidity,
  tokenA,
  tokenB,
  amountAMin,
  amountBMin,
}: {
  outgoingAsset: AddressLike;
  liquidity: BigNumberish;
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'address[2]', 'uint256[2]'],
    [outgoingAsset, liquidity, [tokenA, tokenB], [amountAMin, amountBMin]],
  );
}

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
  incomingAsset,
  minIncomingAssetAmount,
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  uniswapV2Adapter: UniswapV2Adapter;
  tokenA: StandardToken;
  tokenB: StandardToken;
  amountADesired: BigNumberish;
  amountBDesired: BigNumberish;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
  incomingAsset: AddressLike;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough tokenA and tokenB for the tx
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
  }

  const lendArgs = await uniswapV2LendArgs({
    tokenA: tokenA.address,
    tokenB: tokenB.address,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    incomingAsset,
    minIncomingAssetAmount,
  });
  const callArgs = await callOnIntegrationArgs({
    adapter: uniswapV2Adapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );
  await expect(lendTx).resolves.toBeReceipt();

  return lendTx;
}

export async function uniswapV2Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  uniswapV2Adapter,
  outgoingAsset,
  liquidity,
  tokenA,
  tokenB,
  amountAMin,
  amountBMin,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  uniswapV2Adapter: UniswapV2Adapter;
  outgoingAsset: AddressLike;
  liquidity: BigNumberish;
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
}) {
  const redeemArgs = await uniswapv2RedeemArgs({
    outgoingAsset,
    liquidity,
    tokenA,
    tokenB,
    amountAMin,
    amountBMin,
  });
  const callArgs = await callOnIntegrationArgs({
    adapter: uniswapV2Adapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );
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
  fundOwner: Signer;
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

  const takeOrderArgs = await uniswapv2TakeOrderArgs({
    path,
    outgoingAssetAmount,
    minIncomingAssetAmount,
  });
  const callArgs = await callOnIntegrationArgs({
    adapter: uniswapV2Adapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  const takeOrderTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );
  await expect(takeOrderTx).resolves.toBeReceipt();

  return takeOrderTx;
}
