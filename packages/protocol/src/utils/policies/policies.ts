import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { AddressListUpdateType } from '../addressListRegistry';
import { encodeArgs } from '../encoding';

export function addressListRegistryPolicyArgs({
  existingListIds = [],
  newListsArgs = [],
}: {
  existingListIds?: BigNumberish[];
  newListsArgs?: {
    updateType: AddressListUpdateType;
    initialItems: AddressLike[];
  }[];
}) {
  return encodeArgs(
    ['uint256[]', 'bytes[]'],
    [
      existingListIds,
      newListsArgs.map(({ updateType, initialItems }) =>
        encodeArgs(['uint256', 'address[]'], [updateType, initialItems]),
      ),
    ],
  );
}

export function allowedExternalPositionTypesPolicyArgs({
  externalPositionTypeIds,
}: {
  externalPositionTypeIds: BigNumberish[];
}) {
  return encodeArgs(['uint256[]'], [externalPositionTypeIds]);
}

export function cumulativeSlippageTolerancePolicyArgs({ tolerance }: { tolerance: BigNumberish }) {
  return encodeArgs(['uint256'], [tolerance]);
}

export function guaranteedRedemptionPolicyArgs({
  startTimestamp,
  duration,
}: {
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [startTimestamp, duration]);
}

export function minAssetBalancesPostRedemptionPolicyArgs({
  assets,
  minBalances,
}: {
  assets: AddressLike[];
  minBalances: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [assets, minBalances]);
}

export function minMaxInvestmentPolicyArgs({
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [minInvestmentAmount, maxInvestmentAmount]);
}
