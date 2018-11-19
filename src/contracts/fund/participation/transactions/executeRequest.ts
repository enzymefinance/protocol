import { executeRequestFor } from './executeRequestFor';
import { getGlobalEnvironment } from '~/utils/environment';
import { Address } from '@melonproject/token-math/address';

const prepare = async (
  contractAddress: Address,
  environment = getGlobalEnvironment(),
) =>
  executeRequestFor.prepare(
    contractAddress,
    { who: environment.wallet.address },
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
  environment = getGlobalEnvironment(),
) => {
  const prepared = await prepare(contractAddress, environment);
  const result = await send(contractAddress, prepared, undefined, environment);
  return result;
};

execute.prepare = prepare;
execute.send = send;

export { execute as executeRequest };
