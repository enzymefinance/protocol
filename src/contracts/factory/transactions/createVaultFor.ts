import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreateVaultForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreateVaultForArgs> = async (
  _,
  { manager },
) => {
  return manager;
};

export const createVaultFor = transactionFactory(
  'createVaultFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
