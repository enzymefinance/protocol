import { Observable } from 'zen-observable-ts';
import * as R from 'ramda';

import { getContract } from './getContract';
import { getGlobalEnvironment } from '../environment';

const defaultPrepareArgs = (params, contractAddress, environment) =>
  Object.values(params || {}).map(v => v.toString());
const defaultPostProcess = (result, prepared, environment) => result;

const defaultProcessors = {
  postProcess: defaultPostProcess,
  prepareArgs: defaultPrepareArgs,
};

const callFactory = (name, contract, processors = defaultProcessors) => {
  const { postProcess, prepareArgs } = {
    ...defaultProcessors,
    ...processors,
  };

  const prepare = (
    contractAddress,
    params,
    environment = getGlobalEnvironment(),
  ) => {
    const args = prepareArgs(params, contractAddress, environment);
    const contractInstance = getContract(
      contract,
      contractAddress,
      environment,
    );
    const txObject = contractInstance.methods[name](...args);
    const prepared = {
      contractAddress,
      params,
      txObject,
    };
    return prepared;
  };

  const call = async (prepared, environment = getGlobalEnvironment()) => {
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
    const postProcessed = await postProcess(result, prepared, environment);
    return postProcessed;
  };

  // TODO: Possibility to specify custom filters
  // TODO: Check if newBlockHeaders & multiple subscriptions lead to
  // performance problems?
  const observable = (
    contractAddress,
    params,
    environment = getGlobalEnvironment(),
  ) =>
    new Observable(observer => {
      let lastResult;
      const prepared = prepare(contractAddress, params, environment);
      const subscription = environment.eth.subscribe('newBlockHeaders');

      subscription.on('data', async block => {
        if (block.number) {
          const result = await call(prepared, environment);

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

  const execute = async (
    contractAddress,
    params,
    environment = getGlobalEnvironment(),
  ) => {
    const prepared = prepare(contractAddress, params, environment);
    const result = await call(prepared, environment);
    return result;
  };

  execute.prepare = prepare;
  execute.call = call;
  execute.observable = observable;

  return execute;
};

const callFactoryWithoutParams = (name, contract, processors?) => {
  const withParams = callFactory(name, contract, processors);
  const prepare = (contractAddress, environment?) =>
    withParams.prepare(contractAddress, {}, environment);
  const call = withParams.call;
  const observable = (contractAddress, environment?) =>
    withParams.observable(contractAddress, {}, environment);

  const execute = async (
    contractAddress,
    environment = getGlobalEnvironment(),
  ) => {
    const prepared = prepare(contractAddress, environment);
    const result = await call(prepared, environment);
    return result;
  };

  execute.prepare = prepare;
  execute.call = call;
  execute.observable = observable;

  return execute;
};

export { callFactory, callFactoryWithoutParams };
