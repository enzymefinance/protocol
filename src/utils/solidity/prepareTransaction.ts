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
  const encoded = transaction.encodeABI();

  if (transaction.gasEstimation === undefined) {
    try {
      transaction.gasEstimation = await transaction.estimateGas({
        from: environment.wallet.address.toString(),
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
