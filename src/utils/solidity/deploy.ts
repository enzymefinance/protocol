import * as fs from 'fs';
import * as path from 'path';
import { toBI, greaterThan } from '@melonproject/token-math/bigInteger';

import { solidityCompileTarget } from '~/settings';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getWeb3Options } from '~/utils/environment/getWeb3Options';
import { Contracts } from '~/Contracts';

import { TransactionArgs } from './transactionFactory';
import { Environment } from '../environment/Environment';
import { bindLogger } from '../environment/bindLogger';

// TODO: Refactor all callers to only use the Contract interface
type Deploy = {
  (
    pathToSolidityFile: string,
    args?: TransactionArgs,
    environment?: Environment,
  ): Promise<string>;
  (
    contract: Contracts,
    args: TransactionArgs,
    environment: Environment,
  ): Promise<string>;
};

export const deploy: Deploy = async (
  pathToSolidityFile,
  args = [],
  environment = getGlobalEnvironment(),
) => {
  const { debug } = bindLogger(
    environment.logger,
    'melon:protocol:utils:solidity',
  );

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

  // console.log(options, gasEstimation);

  const instance = await transaction.send(options).on('error', error => {
    throw error;
  });
  // .on('transactionHash', txHash => debug('transactionHash', txHash))
  // .on('receipt', rc => debug('receipt', rc));
  // TODO: This currently causes Jest to fail.
  // .on('confirmation', (cn, r) => {}
  //   // debug('confirmation', cn, r.transactionHash),
  // );

  debug('Deployed: ', pathToSolidityFile, instance.options.address);
  return instance.options.address;
};
