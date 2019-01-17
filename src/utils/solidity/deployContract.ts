import * as fs from 'fs';
import * as path from 'path';
import { Address, toBI, greaterThan } from '@melonproject/token-math';

import { solidityCompileTarget } from '~/settings';
import { getWeb3Options } from '~/utils/environment/getWeb3Options';
import { Contracts } from '~/Contracts';
import { TransactionArgs, UnsignedRawTransaction } from './transactionFactory';
import { Environment } from '~/utils/environment/Environment';
import { ensure } from '~/utils/guards/ensure';
import { signTransaction } from '../environment/signTransaction';
import { EnsureError } from '../guards/EnsureError';
import { getLogCurried } from '../environment/getLogCurried';

const getLog = getLogCurried('melon:protocol:utils:solidity:deploy');

interface PrepareDeployReturn {
  unsignedTransaction: UnsignedRawTransaction;
  txIdentifier?: string;
}

interface SendDeployArgs {
  signedTransaction: string;
  txIdentifier?: string;
}

type PrepareDeployFunction = {
  (
    environment: Environment,
    pathToSolidityFile: string,
    args?: TransactionArgs,
  ): Promise<PrepareDeployReturn>;
  (
    environment: Environment,
    contract: Contracts,
    args: TransactionArgs,
  ): Promise<PrepareDeployReturn>;
};

type SendDeployFunction = (
  environment,
  args: SendDeployArgs,
) => Promise<Address>;

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

interface DeployContractMixin {
  prepare: PrepareDeployFunction;
  send: SendDeployFunction;
}

type EnhancedDeploy = DeployContract & DeployContractMixin;

const prepare: PrepareDeployFunction = async (
  environment: Environment,
  pathToSolidityFile,
  args = [],
) => {
  const log = getLog(environment);

  const txIdentifier = `${pathToSolidityFile}(${(args &&
    args.length &&
    args.join(',')) ||
    ''})`;
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

  log.debug(
    'Setup transaction for deployment of',
    txIdentifier,
    environment.wallet.address,
  );

  try {
    const contract = new environment.eth.Contract(parsedABI);

    const transaction = contract.deploy({
      arguments: args,
      data: bin.indexOf('0x') === 0 ? bin : `0x${bin}`,
    });

    const options = getWeb3Options(environment);

    const gasEstimation = await transaction.estimateGas({
      from: environment.wallet.address.toString(),
    });

    log.debug('Gas estimation:', gasEstimation, options);

    ensure(
      !greaterThan(toBI(gasEstimation), toBI(options.gas || 0)),
      [
        `Estimated gas consumption (${gasEstimation})`,
        `is higher than the provided gas limit: ${options.gas}`,
      ].join(' '),
    );

    const encodedAbi = transaction.encodeABI();
    const unsignedTransaction = {
      data: encodedAbi,
      ...options,
    };

    return {
      txIdentifier,
      unsignedTransaction,
    };
  } catch (e) {
    if (e instanceof EnsureError) {
      throw e;
    } else {
      // tslint:disable-next-line:max-line-length
      throw new Error(
        `Error preparing deploy contract transaction: ${txIdentifier}\n${
          e.message
        }`,
      );
    }
  }
};

const send: SendDeployFunction = async (
  environment,
  { txIdentifier = 'Unknown deployment', signedTransaction },
) => {
  const log = getLog(environment);

  try {
    let txHash;

    const receipt = await environment.eth
      .sendSignedTransaction(signedTransaction)
      .on('error', error => {
        throw error;
      })
      .on('transactionHash', t => {
        txHash = t;
        log.debug('TxHash', txIdentifier, txHash);
      })
      .once('confirmation', c => log.debug('Confirmation', txIdentifier, c));

    log.info(
      'Got receipt for:',
      txIdentifier,
      'at contract address:',
      receipt.contractAddress,
      'transaction hash:',
      txHash,
    );

    return new Address(receipt.contractAddress);
  } catch (e) {
    // tslint:disable-next-line:max-line-length
    throw new Error(`Error deploying contract: ${txIdentifier}\n${e.message}`);
  }
};

const deployContract: EnhancedDeploy = async (
  environment: Environment,
  pathToSolidityFile,
  args = [],
) => {
  const { txIdentifier, unsignedTransaction } = await prepare(
    environment,
    pathToSolidityFile,
    args,
  );

  const signedTransaction = await signTransaction(
    environment,
    unsignedTransaction,
  );

  const address = await send(environment, { txIdentifier, signedTransaction });

  return address;
};

deployContract.prepare = prepare;
deployContract.send = send;

export { deployContract };
