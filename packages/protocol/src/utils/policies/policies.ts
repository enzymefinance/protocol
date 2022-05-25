import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import type { AddressListUpdateType } from '../addressListRegistry';
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

interface ListData {
  existingListIds?: BigNumberish[];
  newListsArgs?: {
    updateType: AddressListUpdateType;
    initialItems: AddressLike[];
  }[];
}

export function addressListRegistryPerUserPolicyArgs({
  users = [],
  listsData = [],
}: {
  users?: AddressLike[];
  listsData?: ListData[];
}) {
  return encodeArgs(
    ['address[]', 'bytes[]'],
    [
      users,
      listsData.map(({ existingListIds, newListsArgs }) =>
        addressListRegistryPolicyArgs({ existingListIds, newListsArgs }),
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
