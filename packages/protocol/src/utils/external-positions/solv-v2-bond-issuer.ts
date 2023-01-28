import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';
import { utils } from 'ethers';

import { encodeArgs } from '../encoding';

export enum SolvV2BondIssuerPositionActionId {
  CreateOffer = '0',
  Reconcile = '1',
  Refund = '2',
  RemoveOffer = '3',
  Withdraw = '4',
}

const solvMintParameterTuple = utils.ParamType.fromString(
  `tuple(uint128 lowestPrice, uint128 highestPrice, uint128 tokenInAmount, uint64 effectiveTime, uint64 maturity)`,
);

export function solvV2BondIssuerPositionCreateOfferArgs({
  voucher,
  currency,
  min,
  max,
  startTime,
  endTime,
  useAllowList,
  priceType,
  priceData,
  mintParameter,
}: {
  voucher: AddressLike;
  currency: AddressLike;
  min: BigNumberish;
  max: BigNumberish;
  startTime: BigNumberish;
  endTime: BigNumberish;
  useAllowList: boolean;
  priceType: BigNumberish;
  priceData: BytesLike;
  mintParameter: {
    lowestPrice: BigNumberish;
    highestPrice: BigNumberish;
    tokenInAmount: BigNumberish;
    effectiveTime: BigNumberish;
    maturity: BigNumberish;
  };
}) {
  return encodeArgs(
    ['address', 'address', 'uint128', 'uint128', 'uint32', 'uint32', 'bool', 'uint8', 'bytes', solvMintParameterTuple],
    [voucher, currency, min, max, startTime, endTime, useAllowList, priceType, priceData, mintParameter],
  );
}

export function solvV2BondIssuerPositionRefundArgs({
  voucher,
  slotId,
}: {
  voucher: AddressLike;
  slotId: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [voucher, slotId]);
}

export function solvV2BondIssuerPositionRemoveOfferArgs({ offerId }: { offerId: BigNumberish }) {
  return encodeArgs(['uint24'], [offerId]);
}

export function solvV2BondIssuerPositionWithdrawArgs({
  voucher,
  slotId,
}: {
  voucher: AddressLike;
  slotId: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [voucher, slotId]);
}
