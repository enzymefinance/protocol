import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { encodeArgs } from '../encoding';

export enum NotionalV2PositionActionId {
  AddCollateral = '0',
  Lend = '1',
  Redeem = '2',
  Borrow = '3',
}

export enum NotionalV2TradeActionType {
  Lend = '0',
  Borrow = '1',
  AddLiquidity = '2',
  RemoveLiquidity = '3',
  PurchaseNTokenResidual = '4',
  SettleCashDebt = '5',
}

export function notionalV2PositionAddCollateralArgs({
  currencyId,
  collateralAssetAmount,
}: {
  currencyId: BigNumberish;
  collateralAssetAmount: BigNumberish;
}) {
  return encodeArgs(['uint16', 'uint256'], [currencyId, collateralAssetAmount]);
}

export function notionalV2PositionBorrowArgs({
  collateralCurrencyId,
  borrowCurrencyId,
  collateralAssetAmount,
  marketIndex,
  minLendRate,
  fCashAmount,
}: {
  collateralCurrencyId: BigNumberish;
  borrowCurrencyId: BigNumberish;
  collateralAssetAmount: BigNumberish;
  marketIndex: BigNumberish;
  fCashAmount: BigNumberish;
  minLendRate: BigNumberish;
}) {
  const encodedBorrowTrade = notionalV2EncodeBorrowTradeType(marketIndex, fCashAmount, minLendRate);

  return encodeArgs(
    ['uint16', 'bytes32', 'uint16', 'uint256'],
    [borrowCurrencyId, encodedBorrowTrade, collateralCurrencyId, collateralAssetAmount],
  );
}

export function notionalV2PositionLendArgs({
  currencyId,
  marketIndex,
  underlyingAssetAmount,
  minLendRate,
  fCashAmount,
}: {
  currencyId: BigNumberish;
  marketIndex: BigNumberish;
  underlyingAssetAmount: BigNumberish;
  fCashAmount: BigNumberish;
  minLendRate: BigNumberish;
}) {
  const encodedLendTrade = notionalV2EncodeLendTradeType(marketIndex, fCashAmount, minLendRate);

  return encodeArgs(['uint16', 'uint256', 'bytes32'], [currencyId, underlyingAssetAmount, encodedLendTrade]);
}

export function notionalV2PositionRedeemArgs({
  currencyId,
  yieldTokenAmount,
}: {
  currencyId: BigNumberish;
  yieldTokenAmount: BigNumberish;
}) {
  return encodeArgs(['uint16', 'uint256'], [currencyId, yieldTokenAmount]);
}

export function notionalV2EncodeLendTradeType(
  marketIndex: BigNumberish,
  fCashAmount: BigNumberish,
  minSlippage: BigNumberish,
): BytesLike {
  return utils.solidityPack(
    ['uint8', 'uint8', 'uint88', 'uint32', 'uint120'],
    [NotionalV2TradeActionType.Lend, marketIndex, fCashAmount, minSlippage, BigNumber.from(0)],
  );
}

export function notionalV2EncodeBorrowTradeType(
  marketIndex: BigNumberish,
  fCashAmount: BigNumberish,
  minSlippage: BigNumberish,
): BytesLike {
  return utils.solidityPack(
    ['uint8', 'uint8', 'uint88', 'uint32', 'uint120'],
    [NotionalV2TradeActionType.Borrow, marketIndex, fCashAmount, minSlippage, BigNumber.from(0)],
  );
}
