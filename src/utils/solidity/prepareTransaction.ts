import * as R from 'ramda';
import { toBI, multiply, subtract } from '@melonproject/token-math/bigInteger';

import {
  getGlobalEnvironment,
  Environment,
  isEnvironment,
  defaultOptions,
} from '~/utils/environment';

import { Contracts } from '~/Contracts';
import { Options } from './sendTransaction';

const debug = require('~/utils/getDebug').default(__filename);

export interface PreparedTransaction {
  encoded: string;
  gasEstimation: number;
  name: string;
  transaction: any;
  contract?: Contracts;
}

export const prepareTransaction = async (
  transaction,
  optionsOrEnvironment: Options | Environment,
  maybeEnvironment = getGlobalEnvironment(),
): Promise<PreparedTransaction> => {
  const encoded = transaction.encodeABI();

  const environment = isEnvironment(optionsOrEnvironment)
    ? optionsOrEnvironment
    : maybeEnvironment;

  const options = isEnvironment(optionsOrEnvironment)
    ? {
        amguPayable: false,
        from: environment.wallet.address.toString(),
      }
    : {
        amguPayable: false,
        from: environment.wallet.address.toString(),
        ...optionsOrEnvironment,
      };

  const maxGasPrice = multiply(
    toBI(defaultOptions.gasLimit),
    toBI(defaultOptions.gasPrice),
  );

  const balance = await environment.eth.getBalance(options.from);
  const maxAmguInEth = subtract(toBI(balance), maxGasPrice);

  // We don't know the amgu price at this stage yet, so we just send all
  // available ETH for the gasEstimation. This should throw if amgu price
  // in ETH is bigger than the available balance.
  const amguOptions = options.amguPayable
    ? {
        value: `${maxAmguInEth}`,
        ...options,
      }
    : options;

  try {
    const gasEstimation = await transaction.estimateGas({
      ...R.omit(['amguPayable'], amguOptions),
    });

    transaction.gasEstimation = Math.ceil(
      Math.min(gasEstimation * 1.1, parseInt(environment.options.gasLimit, 10)),
    );
  } catch (e) {
    throw new Error(
      `Gas estimation (preflight) failed for ${
        transaction.name
      }(${transaction.arguments.join(', ')}): ${e.message}`,
    );
  }

  debug(
    'Prepared transaction:',
    transaction.name,
    transaction.arguments,
    transaction.gasEstimation,
    encoded,
  );

  const prepared = {
    encoded,
    gasEstimation: transaction.gasEstimation,
    name: transaction.name,
    transaction,
  };

  return prepared;
};
