import * as R from 'ramda';
import {
  toBI,
  greaterThan,
  multiply,
  subtract,
} from '@melonproject/token-math/bigInteger';

import {
  getGlobalEnvironment,
  Environment,
  isEnvironment,
  defaultOptions,
} from '~/utils/environment';

console.log(isEnvironment, 'asdf');

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

  if (transaction.gasEstimation === undefined) {
    try {
      transaction.gasEstimation = await transaction.estimateGas({
        ...R.omit(['amguPayable'], amguOptions),
      });
    } catch (e) {
      throw new Error(
        `Gas estimation (preflight) failed for ${
          transaction.name
        }(${transaction.arguments.join(', ')}): ${e.message}`,
      );
    }
  }

  debug(
    'Prepared transaction:',
    transaction.name,
    transaction.arguments,
    transaction.gasEstimation,
    encoded,
  );

  if (
    greaterThan(
      toBI(transaction.gasEstimation),
      toBI(environment.options.gasLimit),
    )
  ) {
    throw new Error(
      [
        `Estimated gas consumption (${transaction.gasEstimation})`,
        `is higher than the provided gas limit: ${
          environment.options.gasLimit
        }`,
      ].join(' '),
    );
  }

  const prepared = {
    encoded,
    gasEstimation: transaction.gasEstimation,
    name: transaction.name,
    transaction,
  };

  return prepared;
};
