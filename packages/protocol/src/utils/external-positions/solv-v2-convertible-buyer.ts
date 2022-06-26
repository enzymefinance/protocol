import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum SolvV2ConvertibleBuyerPositionActionId {
  BuyOffering = '0',
  BuySaleByAmount = '1',
  BuySaleByUnits = '2',
  Claim = '3',
  CreateSaleDecliningPrice = '4',
  CreateSaleFixedPrice = '5',
  Reconcile = '6',
  RemoveSale = '7',
}

export enum SolvV2SalePriceType {
  Fixed = 0,
  Declining = 1,
}

export function solvV2ConvertibleBuyerPositionBuyOfferingArgs({
  offerId,
  units,
  voucher,
}: {
  offerId: BigNumberish;
  units: BigNumberish;
  voucher: AddressLike;
}) {
  return encodeArgs(['address', 'uint24', 'uint128'], [voucher, offerId, units]);
}

export function solvV2ConvertibleBuyerPositionBuySaleByAmountArgs({
  amount,
  saleId,
}: {
  amount: BigNumberish;
  saleId: BigNumberish;
}) {
  return encodeArgs(['uint24', 'uint256'], [saleId, amount]);
}

export function solvV2ConvertibleBuyerPositionBuySaleByUnitsArgs({
  saleId,
  units,
}: {
  saleId: BigNumberish;
  units: BigNumberish;
}) {
  return encodeArgs(['uint24', 'uint128'], [saleId, units]);
}

export function solvV2ConvertibleBuyerPositionClaimArgs({
  tokenId,
  voucher,
  units,
}: {
  tokenId: BigNumberish;
  voucher: AddressLike;
  units: BigNumberish;
}) {
  return encodeArgs(['address', 'uint32', 'uint256'], [voucher, tokenId, units]);
}

export function solvV2ConvertibleBuyerPositionCreateSaleDecliningPriceArgs({
  voucher,
  tokenId,
  currency,
  min,
  max,
  startTime,
  useAllowList,
  highest,
  lowest,
  duration,
  interval,
}: {
  voucher: AddressLike;
  tokenId: BigNumberish;
  currency: AddressLike;
  min: BigNumberish;
  max: BigNumberish;
  startTime: BigNumberish;
  useAllowList: boolean;
  highest: BigNumberish;
  lowest: BigNumberish;
  duration: BigNumberish;
  interval: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint24', 'address', 'uint128', 'uint128', 'uint32', 'bool', 'uint128', 'uint128', 'uint32', 'uint32'],
    [voucher, tokenId, currency, min, max, startTime, useAllowList, highest, lowest, duration, interval],
  );
}

export function solvV2ConvertibleBuyerPositionCreateSaleFixedPriceArgs({
  voucher,
  tokenId,
  currency,
  min,
  max,
  startTime,
  useAllowList,
  price,
}: {
  voucher: AddressLike;
  tokenId: BigNumberish;
  currency: AddressLike;
  min: BigNumberish;
  max: BigNumberish;
  startTime: BigNumberish;
  useAllowList: boolean;
  price: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint24', 'address', 'uint128', 'uint128', 'uint32', 'bool', 'uint128'],
    [voucher, tokenId, currency, min, max, startTime, useAllowList, price],
  );
}

export function solvV2ConvertibleBuyerPositionRemoveSaleArgs({ saleId }: { saleId: BigNumberish }) {
  return encodeArgs(['uint24'], [saleId]);
}
