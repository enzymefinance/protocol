import * as path from 'path';
import * as R from 'ramda';

import { constructEnvironment } from '~/utils/environment/constructEnvironment';
import { testLogger } from '../utils/testLogger';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { withDeployment } from '~/utils/environment/withDeployment';
import { withKeystoreSigner } from '~/utils/environment/withKeystoreSigner';
import { withPrivateKeySigner } from '~/utils/environment/withPrivateKeySigner';

const getSystemTestEnvironment = async (
  track = Tracks.TESTING,
): Promise<Environment> => {
  const baseEnvironment = constructEnvironment({
    endpoint: process.env.JSON_RPC_ENDPOINT || 'http://localhost:8545',
    logger: testLogger,
    track,
  });

  const environmentWithDeployment = await withDeployment(baseEnvironment);

  const selectSigner = R.cond([
    [
      R.prop('KEYSTORE_FILE'),
      async env =>
        await withKeystoreSigner(environmentWithDeployment, {
          keystore: require(path.join(
            process.cwd(),
            R.prop('KEYSTORE_FILE', env),
          )),
          password: R.prop('KEYSTORE_PASSWORD', env),
        }),
    ],
    [
      R.prop('PRIVATE_KEY'),
      async env =>
        await withPrivateKeySigner(
          environmentWithDeployment,
          R.prop('PRIVATE_KEY', env),
        ),
    ],
    [
      R.T,
      () => {
        throw new Error('Neither PRIVATE_KEY nor KEYSTORE_FILE found in env');
      },
    ],
  ]);

  const environment = await selectSigner(process.env);

  return environment;
};

export { getSystemTestEnvironment };
