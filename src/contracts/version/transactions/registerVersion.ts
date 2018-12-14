import { Address } from '@melonproject/token-math/address';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

interface RegisterVersionArgs {
  address: Address;
  name: String;
}

const prepareArgs: PrepareArgsFunction<RegisterVersionArgs> = async (
  _,
  { address, name }: RegisterVersionArgs,
) => [`${address}`, name];

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
