import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

export interface CreateParticipationForArgs {
  manager: Address;
}

const prepareArgs: PrepareArgsFunction<CreateParticipationForArgs> = async (
  _,
  { manager },
) => {
  return [manager];
};

export const createParticipationFor = transactionFactory(
  'createParticipationFor',
  Contracts.FundFactory,
  undefined,
  prepareArgs,
  undefined,
  { amguPayable: true },
);
