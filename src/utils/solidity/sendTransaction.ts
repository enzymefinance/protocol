import { getGlobalEnvironment } from '~/utils/environment';

const debug = require('~/utils/getDebug').default(__filename);

export interface Options {
  from?: string;
  gas?: string;
  gasPrice?: string;
  value?: string;
}

export type OptionsCallback = (prepared, environment) => Options;

export type OptionsOrCallback = Options | OptionsCallback;

const defaultOptions = (prepared, environment) => ({
  from: environment.wallet.address,
  gas: `${prepared.gasEstimation}`,
  gasPrice: `${environment.options.gasPrice}`,
  value: '0',
});

export const sendTransaction = async (
  prepared,
  options: OptionsOrCallback = {},
  environment = getGlobalEnvironment(),
) => {
  debug('Sending transaction: ', prepared.name);
  try {
    const params =
      typeof options === 'function' ? options(prepared, environment) : options;
    const defaults = defaultOptions(prepared, environment);
    const defaultedOptions = { ...defaults, ...params };
    const receipt = await prepared.transaction.send(defaultedOptions);
    return receipt;
  } catch (e) {
    throw new Error(
      `Transaction failed for ${
        prepared.name
      }(${prepared.transaction.arguments.join(', ')}): ${e.message}`,
    );
  }
};
