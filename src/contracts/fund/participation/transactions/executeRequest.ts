import { Address } from '@melonproject/token-math/address';
import { sign } from '~/utils/environment/sign';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { executeRequestFor } from './executeRequestFor';

const prepare = async (
  contractAddress: Address,
  options = { amguPayable: true },
  environment = getGlobalEnvironment(),
) =>
  executeRequestFor.prepare(
    contractAddress,
    { who: environment.wallet.address },
    options,
    environment,
  );

const send = async (
  contractAddress: Address,
  prepared,
  undefined,
  environment = getGlobalEnvironment(),
) =>
  executeRequestFor.send(contractAddress, prepared, {}, undefined, environment);

const execute = async (
  contractAddress: Address,
  options = { amguPayable: true },
  environment = getGlobalEnvironment(),
) => {
  const prepared = await prepare(contractAddress, options, environment);
  const signedTransactionData = await sign(
    prepared.rawTransaction,
    environment,
  );
  const result = await send(
    contractAddress,
    signedTransactionData,
    undefined,
    environment,
  );
  return result;
};

execute.prepare = prepare;
execute.send = send;

export { execute as executeRequest };
