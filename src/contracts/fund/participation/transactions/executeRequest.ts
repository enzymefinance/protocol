import { executeRequestFor } from './executeRequestFor';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Address } from '@melonproject/token-math/address';

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
  const result = await send(contractAddress, prepared, undefined, environment);
  return result;
};

execute.prepare = prepare;
execute.send = send;

export { execute as executeRequest };
