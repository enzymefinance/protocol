import { testLogger } from '~/tests/utils/testLogger';
import { constructEnvironment, defaultOptions } from './constructEnvironment';
import { ensure } from '../guards/ensure';

interface InitEnvironmentArgs {
  endpoint?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export const initEnvironment = ({
  endpoint = process.env.JSON_RPC_ENDPOINT,
  gasLimit = defaultOptions.gasLimit,
  gasPrice = defaultOptions.gasPrice,
}: InitEnvironmentArgs) => {
  ensure(!!endpoint, 'No JSON rpc endpoint provided.');

  const environment = constructEnvironment({
    // Pass in Ganache.provider but only if
    // process.env.JSON_RPC_ENDPOINT is not set
    endpoint,
    logger: testLogger,
    options: {
      gasLimit,
      gasPrice,
    },
  });

  return environment;
};
