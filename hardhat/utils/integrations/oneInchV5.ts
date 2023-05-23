import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';
import { utils } from 'ethers';

import { encodeArgs } from '../encoding';

interface OneInchV5OrderDescription {
  srcToken: AddressLike;
  dstToken: AddressLike;
  srcReceiver: AddressLike;
  dstReceiver: AddressLike;
  amount: BigNumberish;
  minReturnAmount: BigNumberish;
  flags: BigNumberish;
}

export interface OneInchV5TakeOrderArgs {
  executor: AddressLike;
  orderDescription: OneInchV5OrderDescription;
  data: BytesLike;
}

export const oneInchV5SwapDescriptionTuple = utils.ParamType.fromString(
  'tuple(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags)',
);

export function oneInchV5TakeOrderArgs({
  executor,
  orderDescription: { srcToken, dstToken, srcReceiver, dstReceiver, amount, minReturnAmount, flags },
  data,
}: OneInchV5TakeOrderArgs) {
  return encodeArgs(
    ['address', oneInchV5SwapDescriptionTuple, 'bytes'],
    [executor, [srcToken, dstToken, srcReceiver, dstReceiver, amount, minReturnAmount, flags], data],
  );
}

export function decodeOneInchSwapArgs(encodedSwapData: string): OneInchV5TakeOrderArgs {
  const functionFragment = utils.Fragment.from(
    'function swap(address,(address,address,address,address,uint256,uint256,uint256),bytes,bytes)',
  );

  const decodedArgs = utils.defaultAbiCoder.decode(functionFragment.inputs, `0x${encodedSwapData.slice(10)}`);
  const [executor, [srcToken, dstToken, srcReceiver, dstReceiver, amount, minReturnAmount, flags], , data] =
    decodedArgs;

  return {
    executor,
    orderDescription: { srcToken, dstToken, srcReceiver, dstReceiver, amount, minReturnAmount, flags },
    data,
  };
}

export function oneInchV5TakeMultipleOrdersArgs({
  ordersData,
  allowOrdersToFail,
}: {
  ordersData: BytesLike[];
  allowOrdersToFail: boolean;
}) {
  return encodeArgs(['bytes[]', 'bool'], [ordersData, allowOrdersToFail]);
}
