import * as fs from 'fs';
import * as path from 'path';
import { toBI, greaterThan } from '@melonproject/token-math/bigInteger';

import { solidityCompileTarget } from '~/settings';
import { getGlobalEnvironment, getWeb3Options } from '~/utils/environment';

const debug = require('~/utils/getDebug').default(__filename);

type ConstructorArg = number | string;
type ConstructorArgs = ConstructorArg | ConstructorArg[];

export const deploy = async (
  pathToSolidityFile: string,
  args: ConstructorArgs[] = [],
  environment = getGlobalEnvironment(),
) => {
  debug('Deploying: ', pathToSolidityFile, args);

  const parsed = path.parse(pathToSolidityFile);

  const rawABI = fs.readFileSync(
    path.join(solidityCompileTarget, parsed.dir, `${parsed.name}.abi`),
    { encoding: 'utf-8' },
  );

  const bin = fs.readFileSync(
    path.join(solidityCompileTarget, parsed.dir, `${parsed.name}.bin`),
    { encoding: 'utf-8' },
  );

  const parsedABI = JSON.parse(rawABI);

  const contract = new environment.eth.Contract(parsedABI);
  const transaction = contract.deploy({
    arguments: args,
    data: bin,
  });

  const options = getWeb3Options(environment);

  const gasEstimation = await transaction.estimateGas({
    from: environment.wallet.address,
  });

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

  debug('Deployed: ', pathToSolidityFile, instance.options.address);
  return instance.options.address;
};
