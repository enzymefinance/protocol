import web3EthAbi from 'web3-eth-abi';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { RegisterExchangeAdapterArgs } from './registerExchangeAdapter';

type UpdateExchangeAdapterArgs = RegisterExchangeAdapterArgs;

const prepareArgs: PrepareArgsFunction<UpdateExchangeAdapterArgs> = async (
  _,
  { exchange, adapter, takesCustody, sigs }: UpdateExchangeAdapterArgs,
) => [
  `${exchange}`,
  `${adapter}`,
  takesCustody,
  sigs.map(sig => web3EthAbi.encodeFunctionSignature(sig)),
];

const updateExchangeAdapter: EnhancedExecute<
  UpdateExchangeAdapterArgs,
  boolean
> = transactionFactory(
  'updateExchangeAdapter',
  Contracts.Registry,
  undefined,
  prepareArgs,
);

export { updateExchangeAdapter };
