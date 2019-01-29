import web3EthAbi from 'web3-eth-abi';
import { Address } from '@melonproject/token-math';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';

export interface RegisterExchangeAdapterArgs {
  exchange: Address;
  adapter: Address;
  takesCustody: Boolean;
  sigs: FunctionSignatures[];
}

const prepareArgs: PrepareArgsFunction<RegisterExchangeAdapterArgs> = async (
  _,
  { exchange, adapter, takesCustody, sigs }: RegisterExchangeAdapterArgs,
) => [
  `${exchange}`,
  `${adapter}`,
  takesCustody,
  sigs.map(sig => web3EthAbi.encodeFunctionSignature(sig)),
];

const registerExchangeAdapter: EnhancedExecute<
  RegisterExchangeAdapterArgs,
  boolean
> = transactionFactory(
  'registerExchangeAdapter',
  Contracts.Registry,
  undefined,
  prepareArgs,
);

export { registerExchangeAdapter };
