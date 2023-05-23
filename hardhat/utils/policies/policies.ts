import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import type { AddressListUpdateType } from '../addressListRegistry';
import { encodeArgs } from '../encoding';
import type { UintListUpdateType } from '../uintListRegistry';

interface AddressListData {
  existingListIds?: BigNumberish[];
  newListsArgs?: {
    updateType: AddressListUpdateType;
    initialItems: AddressLike[];
  }[];
}

interface UintListData {
  existingListIds?: BigNumberish[];
  newListsArgs?: {
    updateType: UintListUpdateType;
    initialItems: BigNumberish[];
  }[];
}

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

export function addressListRegistryPerUserPolicyArgs({
  users = [],
  listsData = [],
}: {
  users?: AddressLike[];
  listsData?: AddressListData[];
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

export function uintListRegistryPerUserPolicyArgs({
  users = [],
  listsData = [],
}: {
  users?: AddressLike[];
  listsData?: UintListData[];
}) {
  return encodeArgs(
    ['address[]', 'bytes[]'],
    [
      users,
      listsData.map(({ existingListIds, newListsArgs }) =>
        uintListRegistryPolicyArgs({ existingListIds, newListsArgs }),
      ),
    ],
  );
}

export function uintListRegistryPolicyArgs({
  existingListIds = [],
  newListsArgs = [],
}: {
  existingListIds?: BigNumberish[];
  newListsArgs?: {
    updateType: UintListUpdateType;
    initialItems: BigNumberish[];
  }[];
}) {
  return encodeArgs(
    ['uint256[]', 'bytes[]'],
    [
      existingListIds,
      newListsArgs.map(({ updateType, initialItems }) =>
        encodeArgs(['uint256', 'uint256[]'], [updateType, initialItems]),
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
