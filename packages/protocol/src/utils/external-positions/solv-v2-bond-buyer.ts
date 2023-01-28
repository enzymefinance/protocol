import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum SolvV2BondBuyerPositionActionId {
  BuyOffering = '0',
  Claim = '1',
}

export function solvV2BondBuyerPositionBuyOfferingArgs({
  offerId,
  units,
}: {
  offerId: BigNumberish;
  units: BigNumberish;
}) {
  return encodeArgs(['uint24', 'uint128'], [offerId, units]);
}

export function solvV2BondBuyerPositionClaimArgs({
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
