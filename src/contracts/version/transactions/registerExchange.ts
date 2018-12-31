import web3EthAbi from 'web3-eth-abi';
import { Address } from '@melonproject/token-math/address';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';

export interface RegisterExchangeArgs {
  exchange: Address;
  adapter: Address;
  takesCustody: Boolean;
  sigs: FunctionSignatures[];
}

const prepareArgs: PrepareArgsFunction<RegisterExchangeArgs> = async (
  _,
  { exchange, adapter, takesCustody, sigs }: RegisterExchangeArgs,
) => [
  `${exchange}`,
  `${adapter}`,
  takesCustody,
  sigs.map(sig => web3EthAbi.encodeFunctionSignature(sig)),
];

const registerExchange: EnhancedExecute<
  RegisterExchangeArgs,
  boolean
> = transactionFactory(
  'registerExchange',
  Contracts.Registry,
  undefined,
  prepareArgs,
);

export { registerExchange };
