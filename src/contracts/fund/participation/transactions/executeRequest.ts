import { Address } from '@melonproject/token-math/address';
import { sign } from '~/utils/environment/sign';
import { executeRequestFor } from './executeRequestFor';
import { Environment } from '~/utils/environment/Environment';

const prepare = async (
  environment: Environment,
  contractAddress: Address,
  options = { amguPayable: true },
) =>
  executeRequestFor.prepare(
    environment,
    contractAddress,
    { who: environment.wallet.address },
    options,
  );

const send = async (
  environment: Environment,
  contractAddress: Address,
  prepared,
) =>
  executeRequestFor.send(environment, contractAddress, prepared, {}, undefined);

const execute = async (
  environment: Environment,
  contractAddress: Address,
  options = { amguPayable: true },
) => {
  const prepared = await prepare(environment, contractAddress, options);
  const signedTransactionData = await sign(
    environment,
    prepared.rawTransaction,
  );
  const result = await send(
    environment,
    contractAddress,
    signedTransactionData,
  );
  return result;
};

execute.prepare = prepare;
execute.send = send;

export { execute as executeRequest };
