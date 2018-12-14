import { testLogger } from '~/tests/utils/testLogger';
import { LogLevels } from './Environment';
import { constructEnvironment } from './constructEnvironment';
import { ensure } from '../guards/ensure';

export const initUnlockedEnvironment = async (endpoint?: string) => {
  const jsonRpcEndpoint = endpoint || process.env.JSON_RPC_ENDPOINT;

  testLogger(
    'melon:protocol:test:utils',
    LogLevels.DEBUG,
    'Endpoint:',
    jsonRpcEndpoint,
    endpoint ? 'via function arg' : 'via JSON_RPC_ENDPOINT envvar',
  );

  ensure(!!jsonRpcEndpoint, 'No JSON rpc endpoint provided.');

  const environment = constructEnvironment({
    // Pass in Ganache.provider but only if
    // process.env.JSON_RPC_ENDPOINT is not set
    endpoint: jsonRpcEndpoint,
    logger: testLogger,
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
