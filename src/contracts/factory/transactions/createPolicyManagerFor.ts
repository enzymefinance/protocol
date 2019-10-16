import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreatePolicyManagerForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreatePolicyManagerForArgs> = async (
  _,
  { manager },
) => {
  return manager;
};

export const createPolicyManagerFor = transactionFactory(
  'createPolicyManagerFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
