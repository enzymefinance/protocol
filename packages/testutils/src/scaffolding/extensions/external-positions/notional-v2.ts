import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  NotionalV2PositionActionId,
  notionalV2PositionAddCollateralArgs,
  notionalV2PositionBorrowArgs,
  notionalV2PositionLendArgs,
  notionalV2PositionRedeemArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export enum NotionalV2MarketIndex {
  ThreeMonths = '1',
  SixMonths = '2',
  OneYear = '3',
  TwoYears = '4',
  FiveYears = '5',
  TenYears = '6',
  TwentyYears = '7',
}

export enum NotionalV2CurrencyId {
  Eth = '1',
  Dai = '2',
  Usdc = '3',
}

export function createNotionalV2Position({
  signer,
  comptrollerProxy,
  externalPositionManager,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
}) {
  return createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.NotionalV2Position,
    signer,
  });
}

// Offsets one unit from NotionalV2MarketIndex, which starts counting at one, to work with arrays.
export function notionalV2GetActiveMarketArraySlot(index: NotionalV2MarketIndex) {
  return Number(index) - 1;
}

export function notionalV2PositionAddCollateral({
  comptrollerProxy,
  externalPositionManager,
  signer,
  currencyId,
  collateralAssetAmount,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  currencyId: BigNumberish;
  collateralAssetAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = notionalV2PositionAddCollateralArgs({
    currencyId,
    collateralAssetAmount,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: NotionalV2PositionActionId.AddCollateral,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function notionalV2PositionBorrow({
  comptrollerProxy,
  externalPositionManager,
  signer,
  collateralCurrencyId = BigNumber.from('1'),
  collateralAssetAmount = 0,
  borrowCurrencyId,
  fCashAmount,
  marketIndex,
  minLendRate,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  collateralCurrencyId?: BigNumberish;
  borrowCurrencyId: BigNumberish;
  collateralAssetAmount?: BigNumberish;
  fCashAmount: BigNumberish;
  marketIndex: BigNumberish;
  minLendRate: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = notionalV2PositionBorrowArgs({
    collateralCurrencyId,
    borrowCurrencyId,
    collateralAssetAmount,
    fCashAmount,
    marketIndex,
    minLendRate,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: NotionalV2PositionActionId.Borrow,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function notionalV2PositionLend({
  comptrollerProxy,
  externalPositionManager,
  signer,
  currencyId,
  underlyingAssetAmount,
  fCashAmount,
  marketIndex,
  minLendRate,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  underlyingAssetAmount: BigNumberish;
  currencyId: BigNumberish;
  fCashAmount: BigNumberish;
  marketIndex: BigNumberish;
  minLendRate: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = notionalV2PositionLendArgs({
    currencyId,
    fCashAmount,
    marketIndex,
    minLendRate,
    underlyingAssetAmount,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: NotionalV2PositionActionId.Lend,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function notionalV2PositionRedeem({
  comptrollerProxy,
  externalPositionManager,
  signer,
  currencyId,
  yieldTokenAmount,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  currencyId: BigNumberish;
  yieldTokenAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = notionalV2PositionRedeemArgs({
    currencyId,
    yieldTokenAmount,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: NotionalV2PositionActionId.Redeem,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}
