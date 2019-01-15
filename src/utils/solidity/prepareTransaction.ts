import * as R from 'ramda';
import { toBI, multiply, subtract } from '@melonproject/token-math';
import { defaultOptions } from '~/utils/environment/constructEnvironment';
import { Contracts } from '~/Contracts';
import { ensure } from '../guards/ensure';

export interface Options {
  amguPayable?: boolean;
  incentive?: boolean;
  skipGuards?: boolean;
  skipGasEstimation?: boolean;
  from?: string;
  gas?: string;
  gasPrice?: string;
  value?: string;
}

export type OptionsCallback = (environment) => Options;

export type OptionsOrCallback = Options | OptionsCallback;

export interface PreparedTransaction {
  encoded: string;
  gasEstimation: number;
  name: string;
  transaction: any;
  contract?: Contracts;
}

export const prepareTransaction = async (
  environment,
  transaction,
  optionsOrCallback: OptionsOrCallback,
): Promise<PreparedTransaction> => {
  const encoded = transaction.encodeABI();

  const options = {
    amguPayable: false,
    from: environment.wallet.address.toString(),
    ...(typeof optionsOrCallback === 'function'
      ? optionsOrCallback(environment)
      : optionsOrCallback),
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

  ensure(
    !(options.skipGasEstimation && !options.gas),
    'Cannot skip gasEstimation if no options.gas is provided',
  );

  try {
    const gasEstimation = options.skipGasEstimation
      ? 0
      : await transaction.estimateGas({
          ...R.omit(['amguPayable'], amguOptions),
        });

    transaction.gasEstimation = Math.ceil(
      Math.min(gasEstimation * 1.1, parseInt(environment.options.gasLimit, 10)),
    );
  } catch (e) {
    throw new Error(
      `Gas estimation (preflight) failed for ${
        transaction.name
      }(${transaction.arguments.map(JSON.stringify).join(', ')}): ${e.message}`,
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
