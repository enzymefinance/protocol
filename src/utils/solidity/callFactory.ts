import { Observable } from 'zen-observable-ts';
import * as R from 'ramda';
import { Environment } from '../environment/Environment';
import { getContract } from './getContract';
import { TransactionArgs } from './transactionFactory';

export type PrepareCallArgsFunction = (
  environment: Environment,
  params,
  contractAddress?,
) => TransactionArgs;

export type PostProcessCallFunction = (
  environment: Environment,
  result,
  prepared?,
) => any;

export interface Processors {
  prepareArgs?: PrepareCallArgsFunction;
  postProcess?: PostProcessCallFunction;
}

const defaultPrepareArgs: PrepareCallArgsFunction = (
  environment,
  params,
  contractAddress,
) => Object.values(params || {}).map(v => v.toString());
const defaultPostProcess: PostProcessCallFunction = (
  environment,
  result,
  prepared,
) => result;

const defaultProcessors = {
  postProcess: defaultPostProcess,
  prepareArgs: defaultPrepareArgs,
};

const callFactory = (
  name,
  contract,
  processors: Processors = defaultProcessors,
) => {
  const { postProcess, prepareArgs } = {
    ...defaultProcessors,
    ...processors,
  };

  const prepare = (environment, contractAddress, params = {}) => {
    const args = prepareArgs(environment, params, contractAddress);
    const contractInstance = getContract(
      environment,
      contract,
      contractAddress,
    );
    const txObject = contractInstance.methods[name](...args);
    const prepared = {
      contractAddress,
      params,
      txObject,
    };
    return prepared;
  };

  const call = async (environment, prepared) => {
    let result;
    try {
      result = await prepared.txObject.call();
    } catch (error) {
      throw new Error(
        `Call failed. ${name}(${prepared.txObject.arguments.join(', ')}): ${
          error.message
        }`,
      );
    }
    const postProcessed = await postProcess(environment, result, prepared);
    return postProcessed;
  };

  // TODO: Possibility to specify custom filters
  // TODO: Check if newBlockHeaders & multiple subscriptions lead to
  // performance problems?
  const observable = (environment, contractAddress, params) =>
    new Observable(observer => {
      let lastResult;
      const prepared = prepare(environment, contractAddress, params);
      const subscription = environment.eth.subscribe('newBlockHeaders');

      subscription.on('data', async block => {
        if (block.number) {
          const result = await call(environment, prepared);

          if (!R.equals(result, lastResult)) {
            observer.next(result);
            lastResult = result;
          }
        }
      });

      // TODO: Better error handling (what kind of errors do we expect?)
      subscription.on('error', error => {
        observer.error(error);
      });

      return () => subscription.unsubscribe();
    });

  const execute = async (environment, contractAddress, params = {}) => {
    const prepared = prepare(environment, contractAddress, params);
    const result = await call(environment, prepared);
    return result;
  };

  execute.prepare = prepare;
  execute.call = call;
  execute.observable = observable;

  return execute;
};

const callFactoryWithoutParams = (name, contract, processors?) => {
  const withParams = callFactory(name, contract, processors);

  const prepare = (environment, contractAddress) =>
    withParams.prepare(environment, contractAddress, {});

  const call = withParams.call;
  const observable = (environment, contractAddress) =>
    withParams.observable(environment, contractAddress, {});

  const execute = async (environment, contractAddress) => {
    const prepared = prepare(environment, contractAddress);
    const result = await call(environment, prepared);
    return result;
  };

  execute.prepare = prepare;
  execute.call = call;
  execute.observable = observable;

  return execute;
};

export { callFactory, callFactoryWithoutParams };
