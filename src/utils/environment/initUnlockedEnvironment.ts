import { testLogger } from '~/tests/utils/testLogger';
import { LogLevels } from './Environment';
import { constructEnvironment, defaultOptions } from './constructEnvironment';
import { ensure } from '../guards/ensure';

interface InitUnlockedEnvironmentArgs {
  endpoint?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export const initUnlockedEnvironment = async ({
  endpoint = process.env.JSON_RPC_ENDPOINT,
  gasLimit = defaultOptions.gasLimit,
  gasPrice = defaultOptions.gasPrice,
}: InitUnlockedEnvironmentArgs) => {
  testLogger(
    'melon:protocol:test:utils',
    LogLevels.DEBUG,
    'Endpoint:',
    endpoint,
    endpoint ? 'via function arg' : 'via JSON_RPC_ENDPOINT envvar',
    'options',
    { gasLimit, gasPrice },
  );

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
  const accounts = await environment.eth.getAccounts();

  ensure(accounts.length > 0, 'No unlocked accounts found');

  const signer = (unsignedTransaction, from = accounts[0]) =>
    environment.eth.signTransaction(unsignedTransaction, from).then(t => t.raw);

  const enhancedEnvironment = {
    ...environment,
    wallet: {
      address: accounts[0],
      sign: signer,
    },
  };

  return enhancedEnvironment;
};
