import * as fs from 'fs';
import * as path from 'path';
import { toBI, greaterThan } from '@melonproject/token-math/bigInteger';
import { solidityCompileTarget } from '~/settings';
import { getWeb3Options } from '~/utils/environment/getWeb3Options';
import { Contracts } from '~/Contracts';
import { TransactionArgs } from './transactionFactory';
import { Environment, LogLevels } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math/address';
import { ensure } from '~/utils/guards/ensure';

// TODO: Refactor all callers to only use the Contract interface
type DeployContract = {
  (
    environment: Environment,
    pathToSolidityFile: string,
    args?: TransactionArgs,
  ): Promise<Address>;
  (
    environment: Environment,
    contract: Contracts,
    args: TransactionArgs,
  ): Promise<Address>;
};

export const deployContract: DeployContract = async (
  environment: Environment,
  pathToSolidityFile,
  args = [],
) => {
  const debug = environment.logger(
    'melon:protocol:utils:solidity',
    LogLevels.DEBUG,
  );
  const info = environment.logger(
    'melon:protocol:utils:solidity',
    LogLevels.INFO,
  );

  const txIdentifier = `${pathToSolidityFile}(${args &&
    args.length &&
    args.join(',')})`;
  const parsed = path.parse(pathToSolidityFile);

  const rawABI = fs.readFileSync(
    path.join(solidityCompileTarget, parsed.dir, `${parsed.name}.abi`),
    { encoding: 'utf-8' },
  );

  const bin = fs.readFileSync(
    path.join(solidityCompileTarget, parsed.dir, `${parsed.name}.bin`),
    { encoding: 'utf-8' },
  );

  ensure(bin.length !== 0, `Binary file for ${pathToSolidityFile} is empty`);

  const parsedABI = JSON.parse(rawABI);

  debug(
    'Setup transaction for deployment of',
    txIdentifier,
    environment.wallet.address,
  );

  const contract = new environment.eth.Contract(parsedABI);

  const transaction = contract.deploy({
    arguments: args,
    data: bin.indexOf('0x') === 0 ? bin : `0x${bin}`,
  });

  const options = getWeb3Options(environment);

  const gasEstimation = await transaction.estimateGas({
    from: environment.wallet.address.toString(),
  });

  debug('Gas estimation:', gasEstimation, options);

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

  try {
    const encodedAbi = transaction.encodeABI();
    let txHash;
    const receipt = await environment.eth
      .sendTransaction({
        data: encodedAbi,
        ...options,
      })
      .on('error', error => {
        throw error;
      })
      .on('transactionHash', t => {
        txHash = t;
        debug('TxHash', txIdentifier, txHash);
      })
      .once('confirmation', c => debug('Confirmation', txIdentifier, c));
    info(
      'Got receipt',
      txIdentifier,
      receipt.contractAddress,
      `${args.join(', ')}`,
      txHash,
    );
    return new Address(receipt.contractAddress);
  } catch (e) {
    throw new Error(`Error with ${txIdentifier}\n${e.message}`);
  }
};
