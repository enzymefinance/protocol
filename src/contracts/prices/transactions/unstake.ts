import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';

import { Contracts } from '~/Contracts';
import { QuantityInterface } from '@melonproject/token-math/quantity';

export interface unstakeArgs {
  amount: QuantityInterface;
  data: any;
}

const prepareArgs: PrepareArgsFunction<unstakeArgs> = async ({
  amount,
  data,
}) => [amount.toString(), data];

const postProcess = async receipt => receipt;

const unstake = transactionFactory(
  'unstake',
  Contracts.StakingPriceFeed,
  undefined,
  prepareArgs,
  postProcess,
);

export default unstake;
