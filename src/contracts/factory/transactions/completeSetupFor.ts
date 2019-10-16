import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CompleteSetupForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CompleteSetupForArgs> = async (
  _,
  { manager },
) => {
  return [manager];
};

export const completeSetupFor = transactionFactory(
  'completeSetupFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
