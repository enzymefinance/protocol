import * as R from 'ramda';
import { EnhancedExecute, MelonTransaction } from './transactionFactory';
import { OptionsOrCallback } from './prepareTransaction';
import { Environment } from '../environment/Environment';

type WithAddressQuerySendFunction<Args> = (
  signedTransactionData: string,
  params: Args,
  options?: OptionsOrCallback,
  environment?: Environment,
) => Promise<any>;

type WithAddressQueryPrepareFunction<Args> = (
  params?: Args,
  options?: OptionsOrCallback,
  environment?: Environment,
) => Promise<MelonTransaction<Args>>;

export type WithAddressQueryExecuteFunction<Args, Result> = (
  params?: Args,
  environment?: Environment,
  options?: OptionsOrCallback,
) => Promise<Result>;

export interface WithAddressQueryExecuteMixin<Args> {
  prepare: WithAddressQueryPrepareFunction<Args>;
  send: WithAddressQuerySendFunction<Args>;
}

export type WithAddressQueryExecute<
  Args,
  Result
> = WithAddressQueryExecuteFunction<Args, Result> &
  WithAddressQueryExecuteMixin<Args>;

export type WithContractAddressQuery = <Args, Result>(
  contractAddressQuery: string[],
  transaction: EnhancedExecute<Args, Result>,
) => WithAddressQueryExecute<Args, Result>;

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
    signedTransactionData,
    params: Args,
    defaultOptions,
    environment?,
  ): Promise<Result> =>
    await transaction.send(
      R.path(contractAddressQuery, params).toString(),
      signedTransactionData,
      params,
      defaultOptions,
      environment,
    );

  const execute = async (params: Args, environment?, options?) => {
    return await transaction(
      R.path(contractAddressQuery, params).toString(),
      params,
      environment,
      options,
    );
  };

  execute.prepare = prepare;
  execute.send = send;

  return execute;
};

export { withContractAddressQuery };
