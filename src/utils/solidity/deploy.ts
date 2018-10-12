import * as fs from 'fs';
import * as path from 'path';
import { BigInteger } from '@melonproject/token-math';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import getWeb3Options from '~/utils/environment/getWeb3Options';

const toBI = BigInteger.toBI;
const debug = require('~/utils/getDebug').default(__filename);

type ConstructorArg = number | string | [number | string];

const deploy = async (
  pathToSolidityFile: string,
  args: ConstructorArg[] = [],
  environment = getGlobalEnvironment(),
) => {
  debug('Deploying: ', pathToSolidityFile);

  const parsed = path.parse(pathToSolidityFile);

  const rawABI = fs.readFileSync(
    path.join(process.cwd(), 'out', parsed.dir, `${parsed.name}.abi`),
    { encoding: 'utf-8' },
  );

  const bin = fs.readFileSync(
    path.join(process.cwd(), 'out', parsed.dir, `${parsed.name}.bin`),
    { encoding: 'utf-8' },
  );

  const parsedABI = JSON.parse(rawABI);

  const contract = new environment.eth.Contract(parsedABI);
  const transaction = contract.deploy({
    data: bin,
    arguments: args,
  });

  const options = getWeb3Options(environment);

  const gasEstimation = await transaction.estimateGas({
    from: environment.wallet.address,
  });

  if (
    BigInteger.greaterThan(
      toBI(gasEstimation),
      toBI(environment.options.gasLimit),
    )
  ) {
    throw new Error(
      `Estimated gas consumption (${gasEstimation}) is higher than the provided gas limit: ${
        environment.options.gasLimit
      }`,
    );
  }

  debug('Gas estimation:', gasEstimation);

  const instance = await transaction
    .send(options)
    .on('error', error => {
      throw error;
    })
    .on('transactionHash', txHash => debug('transactionHash', txHash))
    .on('receipt', rc => debug('receipt', rc))
    .on('confirmation', (cn, r) =>
      debug('confirmation', cn, r.transactionHash),
    );

  return instance.options.address;
};

export default deploy;
