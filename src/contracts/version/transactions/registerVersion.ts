import { Address } from '@melonproject/token-math';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { stringToBytes32 } from '~/utils/helpers/stringToBytes32';

interface RegisterVersionArgs {
  address: Address;
  name: string;
}

const prepareArgs: PrepareArgsFunction<RegisterVersionArgs> = async (
  _,
  { address, name }: RegisterVersionArgs,
) => [`${address}`, stringToBytes32(name)];

const registerVersion: EnhancedExecute<
  RegisterVersionArgs,
  boolean
> = transactionFactory(
  'registerVersion',
  Contracts.Registry,
  undefined,
  prepareArgs,
);

export { registerVersion };
