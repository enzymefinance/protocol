import * as R from 'ramda';

import { Environment, getGlobalEnvironment } from '../environment';
import {
  Contract,
  getContract,
  prepareTransaction,
  PreparedTransaction,
  sendTransaction,
} from '../solidity';
import { Address } from '../types';

type TransactionArg = number | string;
type TransactionArgs = TransactionArg[];

// Guard check if the given transaction can run without errors
// They are crucial to spot "Transaction Execution Errors" before
// the transaction actually hit the nodes. They should throw Errors with
// meaningfull messages
export type GuardFunction<Args> = (
  params?: Args,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<void>;

// Translates JavaScript/TypeScript params into the form that the EVM
// understands: token-math structs, ...
export type PrepareArgsFunction<Args> = (
  params: Args,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<TransactionArgs>;

// Takes the transaction receipt from the EVM, checks if everything is as
// expected and returns a meaningful object
export type PostProcessFunction<Args, Result> = (
  receipt,
  params?: Args,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<Result>;

export type TransactionFactory = <Args, Result>(
  name: string,
  contract: Contract,
  guard?: GuardFunction<Args>,
  prepareArgs?: PrepareArgsFunction<Args>,
  postProcess?: PostProcessFunction<Args, Result>,
) => EnhancedExecute<Args, Result>;

type SendFunction<Args> = (
  contractAddress: Address,
  prepared: PreparedTransaction,
  params: Args,
  environment: Environment,
) => Promise<any>;

type PrepareFunction<Args> = (
  contractAddress: Address,
  params: Args,
  environment: Environment,
) => Promise<PreparedTransaction>;

type ExecuteFunction<Args, Result> = (
  contractAddress: Address,
  params?: Args,
  environment?: Environment,
) => Promise<Result>;

export interface ExecuteMixin<Args> {
  send: SendFunction<Args>;
  prepare: PrepareFunction<Args>;
}

export type EnhancedExecute<Args, Result> = ExecuteFunction<Args, Result> &
  ExecuteMixin<Args>;

export type ExecuteFunctionWithoutContractAddress<Args, Result> = (
  params?: Args,
  environment?: Environment,
) => Promise<Result>;

export type ImplicitExecute<
  Args,
  Result
> = ExecuteFunctionWithoutContractAddress<Args, Result> & ExecuteMixin<Args>;

export type WithContractAddressQuery = <Args, Result>(
  contractAddressQuery: string[],
  transaction: EnhancedExecute<Args, Result>,
) => ImplicitExecute<Args, Result>;

const defaultGuard: GuardFunction<any> = async () => {};
const defaultPrepareArgs: PrepareArgsFunction<any> = async (
  params: string[] = [],
) => params;
const defaultPostProcess: PostProcessFunction<any, any> = async () => true;

/**
 * The transaction factory returns a function "execute" (You have to rename it
 * to the actual name of the transaction, for example: "transfer"). As a
 * minimum, one needs to provide the transaction name and the contract path:
 *
 * ```typescript
 * const tx = transactionFactory('transfer', Contract.Token);
 * ```
 *
 * This transfer function can then be executed directly:
 *
 * ```typescript
 * await tx(new Address('0xdeadbeef'));
 * ```
 *
 * Or sliced into a prepare and a send part:
 * ```typescript
 * const preparedTransaction: PreparedTransaction =
 *    await tx.prepare(new Address('0xdeadbeef'));
 *
 * // pass that prepared transaction to the signer
 * const result = await tx.send(new Address('0xdeadbeef'),
 *    preparedTransaction);
 * ```
 */
const transactionFactory: TransactionFactory = <Args, Result>(
  name,
  contract,
  guard = defaultGuard,
  prepareArgs = defaultPrepareArgs,
  postProcess = defaultPostProcess,
) => {
  const prepare: PrepareFunction<Args> = async (
    contractAddress,
    params,
    environment: Environment = getGlobalEnvironment(),
  ) => {
    await guard(params, contractAddress, environment);
    const args = await prepareArgs(params, contractAddress, environment);
    const contractInstance = getContract(contract, contractAddress);
    const transaction = contractInstance.methods[name](...args);
    transaction.name = name;
    const prepared = await prepareTransaction(transaction, environment);
    return prepared;
  };

  const send: SendFunction<Args> = async (
    contractAddress,
    prepared,
    params,
    environment = getGlobalEnvironment(),
  ) => {
    const receipt = sendTransaction(prepared, environment);
    const postprocessed = await postProcess(
      receipt,
      params,
      contractAddress,
      environment,
    );
    return postprocessed;
  };

  const execute: EnhancedExecute<Args, Result> = async (
    contractAddress,
    params,
    environment = getGlobalEnvironment(),
  ) => {
    const prepared = await prepare(contractAddress, params, environment);
    const result = await send(contractAddress, prepared, params, environment);
    return result;
  };

  execute.prepare = prepare;
  execute.send = send;

  return execute;
};

/**
 * Wraps the result of the transaction factory (EnhancedExecute) in helper
 * functions that do not require to provide contractAddress, but derive this
 * from the params with the contractAddressQuery
 *
 * @param contractAddressQuery
 * @param transaction
 */
const withContractAddressQuery: WithContractAddressQuery = <Args, Result>(
  contractAddressQuery,
  transaction,
) => {
  const prepare = async (params: Args, environment?) =>
    await transaction.prepare(
      R.path(contractAddressQuery, params).toString(),
      params,
      environment,
    );

  const send = async (prepared, params: Args, environment?): Promise<Result> =>
    await transaction.send(
      R.path(contractAddressQuery, params).toString(),
      prepared,
      params,
      environment,
    );

  const execute = async (params: Args, environment?) => {
    return await transaction(
      R.path(contractAddressQuery, params).toString(),
      params,
      environment,
    );
  };

  execute.prepare = prepare;
  execute.send = send;

  return execute;
};

export { transactionFactory, withContractAddressQuery };
