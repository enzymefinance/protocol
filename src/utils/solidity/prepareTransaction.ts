import { BigInteger } from '@melonproject/token-math';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

const debug = require('~/utils/getDebug').default(__filename);
const { toBI, greaterThan } = BigInteger;

const prepareTransaction = async (
  transaction,
  environment = getGlobalEnvironment(),
) => {
  console.log(transaction.name);

  const encoded = transaction.encodeABI();
  const gasEstimation = await transaction.estimateGas({
    from: environment.wallet.address,
  });

  debug(
    'Prepared transaction:',
    transaction.name,
    transaction.arguments,
    gasEstimation,
    encoded,
  );

  if (greaterThan(toBI(gasEstimation), toBI(environment.options.gasLimit))) {
    throw new Error(
      `Estimated gas consumption (${gasEstimation}) is higher than the provided gas limit: ${
        environment.options.gasLimit
      }`,
    );
  }

  const prepared = {
    transaction,
    name: transaction.name,
    encoded,
    gasEstimation,
  };

  return prepared;
};

export default prepareTransaction;
