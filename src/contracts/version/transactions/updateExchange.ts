import web3EthAbi from 'web3-eth-abi';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { RegisterExchangeArgs } from './registerExchange';

type UpdateExchangeArgs = RegisterExchangeArgs;

const prepareArgs: PrepareArgsFunction<UpdateExchangeArgs> = async (
  _,
  { exchange, adapter, takesCustody, sigs }: UpdateExchangeArgs,
) => [
  `${exchange}`,
  `${adapter}`,
  takesCustody,
  sigs.map(sig => web3EthAbi.encodeFunctionSignature(sig)),
];

const updateExchange: EnhancedExecute<
  UpdateExchangeArgs,
  boolean
> = transactionFactory(
  'updateExchange',
  Contracts.Registry,
  undefined,
  prepareArgs,
);

export { updateExchange };
