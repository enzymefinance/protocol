import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent, resolveAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  callOnExternalPositionArgs,
  ExternalPositionManagerActionId,
  ExternalPositionType,
  UniswapV3LiquidityPositionActionId,
  uniswapV3LiquidityPositionAddLiquidityArgs,
  uniswapV3LiquidityPositionCollectArgs,
  UniswapV3LiquidityPositionLib,
  uniswapV3LiquidityPositionMintArgs,
  uniswapV3LiquidityPositionPurgeArgs,
  uniswapV3LiquidityPositionRemoveLiquidityArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish, BytesLike } from 'ethers';

import { createExternalPosition } from './actions';

export enum UniswapV3FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

export const uniswapV3LiquidityPositionGetMinTick = (tickSpacing: number) =>
  Math.ceil(-887272 / tickSpacing) * tickSpacing;
export const uniswapV3LiquidityPositionGetMaxTick = (tickSpacing: number) =>
  Math.floor(887272 / tickSpacing) * tickSpacing;

export async function createUniswapV3LiquidityPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
  callOnExternalPositionData = '0x',
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  callOnExternalPositionData?: BytesLike;
}) {
  const { externalPositionProxy: externalPositionProxyContract, receipt } = await createExternalPosition({
    callOnExternalPositionData,
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.UniswapV3LiquidityPosition,
    signer,
  });

  return { externalPositionProxyAddress: externalPositionProxyContract.address, receipt };
}

export async function uniswapV3LiquidityPositionAddLiquidity({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  nftId,
  amount0Desired,
  amount1Desired,
  amount0Min = 0,
  amount1Min = 0,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  nftId: BigNumberish;
  amount0Desired: BigNumberish;
  amount1Desired: BigNumberish;
  amount0Min?: BigNumberish;
  amount1Min?: BigNumberish;
}) {
  const actionArgs = uniswapV3LiquidityPositionAddLiquidityArgs({
    amount0Desired,
    amount0Min,
    amount1Desired,
    amount1Min,
    nftId,
  });

  const callArgs = callOnExternalPositionArgs({
    actionArgs,
    actionId: UniswapV3LiquidityPositionActionId.AddLiquidity,
    externalPositionProxy,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);
}

export async function uniswapV3LiquidityPositionCollect({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  nftId,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  nftId: BigNumberish;
}) {
  const actionArgs = uniswapV3LiquidityPositionCollectArgs({
    nftId,
  });

  const callArgs = callOnExternalPositionArgs({
    actionArgs,
    actionId: UniswapV3LiquidityPositionActionId.Collect,
    externalPositionProxy,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);
}

export async function uniswapV3LiquidityPositionMint({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  token0,
  token1,
  fee,
  tickLower,
  tickUpper,
  amount0Desired,
  amount1Desired,
  amount0Min = 0,
  amount1Min = 0,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  token0: AddressLike;
  token1: AddressLike;
  fee: BigNumberish;
  tickLower: BigNumberish;
  tickUpper: BigNumberish;
  amount0Desired: BigNumberish;
  amount1Desired: BigNumberish;
  amount0Min?: BigNumberish;
  amount1Min?: BigNumberish;
}) {
  const actionArgs = uniswapV3LiquidityPositionMintArgs({
    amount0Desired,
    amount0Min,
    amount1Desired,
    amount1Min,
    fee,
    tickLower,
    tickUpper,
    token0,
    token1,
  });

  const callArgs = callOnExternalPositionArgs({
    actionArgs,
    actionId: UniswapV3LiquidityPositionActionId.Mint,
    externalPositionProxy,
  });

  const receipt = await comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  const externalPosition = new UniswapV3LiquidityPositionLib(externalPositionProxy, provider);
  const nftId = extractEvent(receipt, externalPosition.abi.getEvent('NFTPositionAdded'))[0].args.tokenId;

  return { nftId, receipt };
}

export async function uniswapV3LiquidityPositionPurge({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  nftId,
  liquidity,
  amount0Min = 0,
  amount1Min = 0,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  nftId: BigNumberish;
  liquidity: BigNumberish;
  amount0Min?: BigNumberish;
  amount1Min?: BigNumberish;
}) {
  const actionArgs = uniswapV3LiquidityPositionPurgeArgs({
    amount0Min,
    amount1Min,
    liquidity,
    nftId,
  });

  const callArgs = callOnExternalPositionArgs({
    actionArgs,
    actionId: UniswapV3LiquidityPositionActionId.Purge,
    externalPositionProxy,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);
}

export async function uniswapV3LiquidityPositionRemoveLiquidity({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  nftId,
  liquidity,
  amount0Min = 0,
  amount1Min = 0,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  nftId: BigNumberish;
  liquidity: BigNumberish;
  amount0Min?: BigNumberish;
  amount1Min?: BigNumberish;
}) {
  const actionArgs = uniswapV3LiquidityPositionRemoveLiquidityArgs({
    amount0Min,
    amount1Min,
    liquidity,
    nftId,
  });

  const callArgs = callOnExternalPositionArgs({
    actionArgs,
    actionId: UniswapV3LiquidityPositionActionId.RemoveLiquidity,
    externalPositionProxy,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);
}

export function uniswapV3OrderTokenPair({ tokenA, tokenB }: { tokenA: AddressLike; tokenB: AddressLike }) {
  const tokenAAddress = resolveAddress(tokenA);
  const tokenBAddress = resolveAddress(tokenB);

  return tokenAAddress < tokenBAddress
    ? { token0: tokenAAddress, token1: tokenBAddress }
    : { token0: tokenBAddress, token1: tokenAAddress };
}
