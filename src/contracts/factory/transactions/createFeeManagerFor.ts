import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreateFeeManagerFor {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreateFeeManagerFor> = async (
  _,
  { manager },
) => {
  return manager;
};

export const createFeeManagerFor = transactionFactory(
  'createFeeManagerFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
