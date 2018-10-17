import * as Eth from 'web3-eth';
import * as R from 'ramda';
import { string } from 'yup';

import getDebug from '~/utils/getDebug';

import { tracks } from '../constants/tracks';
import { Environment, Options } from './Environment';

const debug = getDebug(__filename);

const defaultOptions: Options = {
  gasLimit: '8000000',
  gasPrice: '2000000000',
};

const checkIpc = endpoint => {
  const fs = require('fs');

  try {
    fs.accessSync(endpoint, fs.constants.W_OK);
    return true;
  } catch (e) {
    throw new Error(
      [
        `Can not construct provider from endpoint: ${endpoint}`,
        'HTTP, WS and IPC failed',
      ].join(''),
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

const constructProvider = jsonRpcEndpoint => {
  const endpoint = jsonRpcEndpoint || process.env.JSON_RPC_ENDPOINT;

  string()
    .url(
      [
        `Invalid JSON RPC endpoint url: ${endpoint}.`,
        `Check your .env file or provide it explicitely`,
      ].join(''),
    )
    .isValid(endpoint);

  const provider = selectProvider(endpoint);

  debug('Provider constructed', endpoint);

  return provider;
};

export const constructEnvironment = ({
  jsonRpcEndpoint = undefined,
  provider = undefined,
  wallet = undefined,
  track = tracks.DEMO,
  options = defaultOptions,
}): Environment => ({
  eth: new Eth(provider || constructProvider(jsonRpcEndpoint)),
  // tslint:disable-next-line:object-shorthand-properties-first
  options,
  track,
  wallet,
});
