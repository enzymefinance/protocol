import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreateTradingForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreateTradingForArgs> = async (
  _,
  { manager },
) => {
  return manager;
};

export const createTradingFor = transactionFactory(
  'createTradingFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
