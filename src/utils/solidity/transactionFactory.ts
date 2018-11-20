import * as R from 'ramda';

import { Environment, getGlobalEnvironment } from '../environment';
import {
  getContract,
  prepareTransaction,
  PreparedTransaction,
  sendTransaction,
  OptionsOrCallback,
} from '../solidity';
import { Address } from '../types';
import { Contracts } from '~/Contracts';

// TODO: Fix the types here once the transaction factory decorators are
// properly implemented.
type TransactionArg = any;
type TransactionArgs = TransactionArg[] | any;

// Guard check if the given transaction can run without errors
// They are crucial to spot "Transaction Execution Errors" before
// the transaction actually hit the nodes. They should throw Errors with
// meaningful messages
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
  contract: Contracts,
  guard?: GuardFunction<Args>,
  prepareArgs?: PrepareArgsFunction<Args>,
  postProcess?: PostProcessFunction<Args, Result>,
  defaultOptions?: OptionsOrCallback,
) => EnhancedExecute<Args, Result>;

type SendFunction<Args> = (
  contractAddress: Address,
  prepared: PreparedTransaction,
  params: Args,
  options?: OptionsOrCallback,
  environment?: Environment,
) => Promise<any>;

type PrepareFunction<Args> = (
  contractAddress: Address,
  params?: Args,
  options?: OptionsOrCallback,
  environment?: Environment,
) => Promise<PreparedTransaction>;

type ExecuteFunction<Args, Result> = (
  contractAddress: Address,
  params?: Args,
  options?: OptionsOrCallback,
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

export interface WithTransactionDecoratorOptions<Args, Result> {
  guard?: GuardFunction<Args>;
  prepareArgs?: PrepareArgsFunction<Args>;
  postProcess?: PostProcessFunction<Args, Result>;
}

export type WithTransactionDecorator = <Args, Result>(
  transaction: EnhancedExecute<Args, Result>,
  decorator: WithTransactionDecoratorOptions<Args, Result>,
) => EnhancedExecute<Args, Result>;

export const defaultGuard: GuardFunction<any> = async () => {};

export const defaultPrepareArgs = async (
  params,
  contractAddress,
  environment,
) => Object.values(params || {}).map(v => v.toString());

export const defaultPostProcess: PostProcessFunction<any, any> = async () =>
  true;

/**
 * The transaction factory returns a function "execute" (You have to rename it
 * to the actual name of the transaction, for example: "transfer"). As a
 * minimum, one needs to provide the transaction name and the contract path:
 *
 * ```typescript
 * const transfer = transactionFactory('transfer', Contract.Token);
 * ```
 *
 * This transfer function can then be executed directly:
 *
 * ```typescript
 * await transfer(new Address('0xdeadbeef'));
 * ```
 *
 * Or sliced into a prepare and a send part:
 * ```typescript
 * const preparedTransaction: PreparedTransaction =
 *    await transfer.prepare(new Address('0xdeadbeef'));
 *
 * // pass that prepared transaction to the signer
 * const result = await transfer.send(new Address('0xdeadbeef'),
 *    preparedTransaction);
 * ```
 */
const transactionFactory: TransactionFactory = <Args, Result>(
  name,
  contract,
  guard = defaultGuard,
  prepareArgs = defaultPrepareArgs,
  postProcess = defaultPostProcess,
  defaultOptions,
) => {
  const prepare: PrepareFunction<Args> = async (
    contractAddress,
    params,
    options = defaultOptions,
    environment: Environment = getGlobalEnvironment(),
  ) => {
    await guard(params, contractAddress, environment);
    const args = await prepareArgs(params, contractAddress, environment);
    const contractInstance = getContract(contract, contractAddress);
    const transaction = contractInstance.methods[name](...args);
    transaction.name = name;
    const prepared = await prepareTransaction(
      transaction,
      options,
      environment,
    );
    return { ...prepared, contract };
  };

  const send: SendFunction<Args> = async (
    contractAddress,
    prepared,
    params,
    options = defaultOptions,
    environment = getGlobalEnvironment(),
  ) => {
    const receipt = await sendTransaction(prepared, options, environment);
    const postprocessed = await postProcess(
      receipt,
      params,
      contractAddress,
      environment,
    );
    return postprocessed;
  };

  const execute: ExecuteFunction<Args, Result> = async (
    contractAddress,
    params,
    options = defaultOptions,
    environment = getGlobalEnvironment(),
  ) => {
    const prepared = await prepare(
      contractAddress,
      params,
      options,
      environment,
    );
    const result = await send(
      contractAddress,
      prepared,
      params,
      defaultOptions,
      environment,
    );
    return result;
  };

  (execute as EnhancedExecute<Args, Result>).prepare = prepare;
  (execute as EnhancedExecute<Args, Result>).send = send;

  return execute as EnhancedExecute<Args, Result>;
};

const withTransactionDecorator: WithTransactionDecorator = <Args, Result>(
  transaction,
  decorator,
) => {
  const prepare: PrepareFunction<Args> = async (
    contractAddress,
    params,
    options,
    environment: Environment = getGlobalEnvironment(),
  ) => {
    if (typeof decorator.guard !== 'undefined') {
      await decorator.guard(params, contractAddress, environment);
    }

    let processedParams = params;
    if (typeof decorator.prepareArgs !== 'undefined') {
      processedParams = await decorator.prepareArgs(
        params,
        contractAddress,
        environment,
      );
    }

    return transaction.prepare(
      contractAddress,
      processedParams,
      options,
      environment,
    );
  };

  const send: SendFunction<Args> = async (
    contractAddress,
    prepared,
    params,
    options,
    environment = getGlobalEnvironment(),
  ) => {
    const result = await transaction.send(
      contractAddress,
      prepared,
      params,
      options,
      environment,
    );
    if (typeof decorator.postProcess !== 'undefined') {
      return decorator.postProcess(
        result,
        params,
        contractAddress,
        environment,
      );
    }

    return result;
  };

  const execute: ExecuteFunction<Args, Result> = async (
    contractAddress,
    params,
    options,
    environment = getGlobalEnvironment(),
  ) => {
    return transaction.execute(contractAddress, params, options, environment);
  };

  (execute as EnhancedExecute<Args, Result>).prepare = prepare;
  (execute as EnhancedExecute<Args, Result>).send = send;

  return execute as EnhancedExecute<Args, Result>;
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

  const send = async (
    prepared,
    params: Args,
    defaultOptions,
    environment?,
  ): Promise<Result> =>
    await transaction.send(
      R.path(contractAddressQuery, params).toString(),
      prepared,
      params,
      defaultOptions,
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

export {
  transactionFactory,
  withTransactionDecorator,
  withContractAddressQuery,
};
