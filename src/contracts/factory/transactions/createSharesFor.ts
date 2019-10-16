import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreateSharesForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreateSharesForArgs> = async (
  _,
  { manager },
) => {
  return manager;
};

export const createSharesFor = transactionFactory(
  'createSharesFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
