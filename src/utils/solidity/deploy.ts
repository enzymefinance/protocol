import * as fs from 'fs';
import * as path from 'path';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

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

  const instance = await contract
    .deploy({
      data: bin,
      arguments: args,
    })
    .send({
      gas: 3000000,
      gasPrice: '2000000000',
      from: environment.wallet.address,
    })
    .on('error', error => {
      throw error;
    })
    .on('transactionHash', txHash => debug('transactionHash', txHash))
    .on('receipt', rc => debug('receipt', rc))
    .on('confirmation', (cn, r) => debug('confirmation', cn, r));

  return instance.options.address;
};

export default deploy;
