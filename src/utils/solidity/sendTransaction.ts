import { getGlobalEnvironment } from '~/utils/environment';

const debug = require('~/utils/getDebug').default(__filename);

export const sendTransaction = async (
  prepared,
  environment = getGlobalEnvironment(),
) => {
  debug('Sending transaction: ', prepared.name);

  try {
    const receipt = await prepared.transaction.send({
      from: environment.wallet.address,
      // TODO: Check for DELEGATE_CALL or LIBRARY
      gas: Math.floor(prepared.gasEstimation).toString(),
      gasPrice: environment.options.gasPrice,
    });
    return receipt;
  } catch (e) {
    throw new Error(
      `Gas estimation (preflight) failed for ${
        prepared.name
      }(${prepared.transaction.arguments.join(', ')}): ${e.message}`,
    );
  }
};
