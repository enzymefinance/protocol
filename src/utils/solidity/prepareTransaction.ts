import { toBI, greaterThan } from '@melonproject/token-math/bigInteger';

import { getGlobalEnvironment } from '~/utils/environment';
import { Contracts } from '~/Contracts';

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
  environment = getGlobalEnvironment(),
): Promise<PreparedTransaction> => {
  let gasEstimation;
  const encoded = transaction.encodeABI();

  try {
    gasEstimation = await transaction.estimateGas({
      from: environment.wallet.address.toString(),
    });
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
    gasEstimation,
    encoded,
  );

  if (greaterThan(toBI(gasEstimation), toBI(environment.options.gasLimit))) {
    throw new Error(
      [
        `Estimated gas consumption (${gasEstimation})`,
        `is higher than the provided gas limit: ${
          environment.options.gasLimit
        }`,
      ].join(' '),
    );
  }

  const prepared = {
    encoded,
    gasEstimation,
    name: transaction.name,
    transaction,
  };

  return prepared;
};
