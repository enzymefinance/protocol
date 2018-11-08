import { Observable } from 'zen-observable-ts';
import * as R from 'ramda';

import { getContract } from './getContract';
import { getGlobalEnvironment } from '../environment';

const callFactory = (name, contract, { prepareArgs, postProcess }) => {
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
      txObject,
    };
    return prepared;
  };

  const call = async (prepared, environment = getGlobalEnvironment()) => {
    const result = await prepared.txObject.call();
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

export { callFactory };
