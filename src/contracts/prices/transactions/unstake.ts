import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';

import { Contracts } from '~/Contracts';
import { QuantityInterface } from '@melonproject/token-math';

export interface UnstakeArgs {
  amount: QuantityInterface;
  data: any;
}

const prepareArgs: PrepareArgsFunction<UnstakeArgs> = async (
  _,
  { amount, data },
) => [amount.toString(), data];

const postProcess = async (_, receipt) => receipt;

const unstake = transactionFactory(
  'unstake',
  Contracts.StakingPriceFeed,
  undefined,
  prepareArgs,
  postProcess,
);

export default unstake;
