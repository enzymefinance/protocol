import * as R from 'ramda';
import { EnhancedExecute, MelonTransaction } from './transactionFactory';
import { OptionsOrCallback } from './prepareTransaction';
import { Environment } from '../environment/Environment';

type WithAddressQuerySendFunction<Args> = (
  environment: Environment,
  signedTransactionData: string,
  params: Args,
  options?: OptionsOrCallback,
) => Promise<any>;

type WithAddressQueryPrepareFunction<Args> = (
  environment: Environment,
  params?: Args,
  options?: OptionsOrCallback,
) => Promise<MelonTransaction<Args>>;

export type WithAddressQueryExecuteFunction<Args, Result> = (
  environment: Environment,
  params?: Args,
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
  const prepare = (environment: Environment, params: Args, options?) => {
    return transaction.prepare(
      environment,
      R.path(contractAddressQuery, params).toString(),
      params,
      options,
    );
  };

  const send = (
    environment: Environment,
    signedTransactionData,
    params: Args,
    options?,
  ): Promise<Result> => {
    return transaction.send(
      environment,
      R.path(contractAddressQuery, params).toString(),
      signedTransactionData,
      params,
      options,
    );
  };

  const execute = async (environment: Environment, params: Args, options?) => {
    return await transaction(
      environment,
      R.path(contractAddressQuery, params).toString(),
      params,
      options,
    );
  };

  execute.prepare = prepare;
  execute.send = send;

  return execute;
};

export { withContractAddressQuery };
