import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreateAccountingForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreateAccountingForArgs> = async (
  _,
  { manager },
) => {
  return manager;
};

export const createAccountingFor = transactionFactory(
  'createAccountingFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
