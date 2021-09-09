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

export function guaranteedRedemptionPolicyArgs({
  startTimestamp,
  duration,
}: {
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [startTimestamp, duration]);
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
