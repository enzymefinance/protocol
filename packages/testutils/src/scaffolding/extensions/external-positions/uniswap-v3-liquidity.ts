import type { AddressLike, Call, Contract } from '@enzymefinance/ethers';
import { contract, extractEvent } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  callOnExternalPositionArgs,
  encodeArgs,
  ExternalPositionManagerActionId,
  ExternalPositionType,
  UniswapV3LiquidityPositionActionId,
  uniswapV3LiquidityPositionAddLiquidityArgs,
  uniswapV3LiquidityPositionCollectArgs,
  uniswapV3LiquidityPositionInitArgs,
  UniswapV3LiquidityPositionLib,
  uniswapV3LiquidityPositionMintArgs,
  uniswapV3LiquidityPositionPurgeArgs,
  uniswapV3LiquidityPositionRemoveLiquidityArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import type { BigNumber, BigNumberish } from 'ethers';

export enum UniswapV3FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

export const uniswapV3LiquidityPositionGetMinTick = (tickSpacing: number) =>
  Math.ceil(-887272 / tickSpacing) * tickSpacing;
export const uniswapV3LiquidityPositionGetMaxTick = (tickSpacing: number) =>
  Math.floor(887272 / tickSpacing) * tickSpacing;

export interface IUniswapV3NonFungibleTokenManager extends Contract<IUniswapV3NonFungibleTokenManager> {
  positions: Call<
    (tokenId: BigNumberish) => {
      nonce: BigNumber;
      operator: string;
      token0: string;
      token1: string;
      fee: BigNumber;
      tickLower: BigNumber;
      tickUpper: BigNumber;
      liquidity: BigNumber;
      feeGrowthInside0LastX128: BigNumber;
      feeGrowthInside1LastX128: BigNumber;
      tokensOwed0: BigNumber;
      tokensOwed1: BigNumber;
    },
    Contract<any>
  >;
}

export const IUniswapV3NonFungibleTokenManager = contract<IUniswapV3NonFungibleTokenManager>()`
  function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)
`;

export async function createUniswapV3LiquidityPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
  token0,
  token1,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  token0: AddressLike;
  token1: AddressLike;
}) {
  const initArgs = uniswapV3LiquidityPositionInitArgs({
    token0,
    token1,
  });

  const receipt = await comptrollerProxy
    .connect(signer)
    .callOnExtension(
      externalPositionManager,
      ExternalPositionManagerActionId.CreateExternalPosition,
      encodeArgs(['uint256', 'bytes'], [ExternalPositionType.UniswapV3LiquidityPosition, initArgs]),
    );

  const vaultProxy = new VaultLib(await comptrollerProxy.getVaultProxy(), signer);
  const externalPositions = await vaultProxy.getActiveExternalPositions.call();
  const externalPositionProxyAddress = externalPositions[externalPositions.length - 1];

  return { externalPositionProxyAddress, receipt };
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
