import * as Eth from 'web3-eth';
import * as R from 'ramda';
import { string } from 'yup';

import getDebug from '~/utils/getDebug';

import tracks from '../constants/tracks';
import Environment from './Environment';

const debug = getDebug(__filename);

const checkIpc = endpoint => {
  const fs = require('fs');

  try {
    fs.accessSync(endpoint, fs.constants.W_OK);
    return true;
  } catch (e) {
    throw new Error(
      `Can not construct provider from endpoint: ${endpoint}. HTTP, WS and IPC failed`,
    );
  }
};

const selectProvider = R.cond([
  [
    R.startsWith('ws'),
    endpoint => new Eth.providers.WebsocketProvider(endpoint),
  ],
  [R.startsWith('http', endpoint => new Eth.providers.HttpProvider(endpoint))],
  [checkIpc, endpoint => new Eth.providers.IpcProvider(endpoint)],
]);

const constructProvider = JsonRpcEndpoint => {
  const endpoint = JsonRpcEndpoint || process.env.JSON_RPC_ENDPOINT;

  string()
    .url(
      `Invalid JSON RPC endpoint url: ${endpoint}. Check your .env file or provide it explicitely`,
    )
    .isValid(endpoint);

  const provider = selectProvider(endpoint);

  debug('Provider constructed', endpoint);

  return provider;
};

const constructEnvironment = ({
  jsonRpcEndpoint = undefined,
  provider = undefined,
  wallet = undefined,
  track = tracks.DEMO,
}): Environment => ({
  eth: new Eth(provider || constructProvider(jsonRpcEndpoint)),
  track,
  wallet,
});

export default constructEnvironment;
