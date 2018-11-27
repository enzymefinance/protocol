import * as Eth from 'web3-eth';
import * as R from 'ramda';
import { string } from 'yup';
import getDebug from '~/utils/getDebug';
import { tracks } from '../constants/tracks';
import { Environment, Options } from './Environment';

const debug = getDebug(__filename);

export const defaultOptions: Options = {
  gasLimit: '8000000',
  gasPrice: '1000000000',
};

const checkIpc = endpoint => {
  const fs =
    typeof module !== 'undefined' && module.exports && require('f' + 's');

  try {
    fs.accessSync(endpoint, fs.constants.W_OK);
    return true;
  } catch (e) {
    // Swallow any potential error.
  }

  return false;
};

const makeWsProvider = endpoint =>
  new Eth.providers.WebsocketProvider(endpoint);

const makeHttpProvider = endpoint => new Eth.providers.HttpProvider(endpoint);

const makeIpcProvider = endpoint => new Eth.providers.IpcProvider(endpoint);

const selectProvider = R.cond([
  [R.startsWith('ws'), makeWsProvider],
  [R.startsWith('http'), makeHttpProvider],
  [checkIpc, makeIpcProvider],
]);

const constructProvider = endpoint => {
  string()
    .url(
      [
        `Invalid JSON RPC endpoint url: ${endpoint}.`,
        `Check your .env file or provide it explicitly`,
      ].join(''),
    )
    .isValid(endpoint);

  const provider = selectProvider(endpoint);
  if (!provider) {
    throw new Error(
      [
        `Can not construct provider from endpoint: ${endpoint}`,
        'HTTP, WS and IPC failed',
      ].join(''),
    );
  }

  debug('Provider constructed', endpoint);

  return provider;
};

export const constructEnvironment = ({
  endpoint = undefined,
  provider = undefined,
  wallet = undefined,
  track = tracks.DEMO,
  options = defaultOptions,
}): Environment => {
  if (!endpoint && !provider) {
    throw new Error(
      'You need to provide either a endpoint or a provider instance.',
    );
  }

  return {
    eth: new Eth(provider || constructProvider(endpoint)),
    // tslint:disable-next-line:object-shorthand-properties-first
    options,
    track,
    wallet,
  };
};
