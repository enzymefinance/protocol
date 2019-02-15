import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface RegisterFeesArgs {
  addresses: Address[];
}

type RegisterFeesResult = boolean;

const prepareArgs: PrepareArgsFunction<RegisterFeesArgs> = async (
  _,
  { addresses }: RegisterFeesArgs,
) => [addresses.map(a => a.toString())];

export const registerFees: EnhancedExecute<
  RegisterFeesArgs,
  RegisterFeesResult
> = transactionFactory(
  'registerFees',
  Contracts.Registry,
  undefined,
  prepareArgs,
);
