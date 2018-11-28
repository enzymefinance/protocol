import { deploy } from '~/utils/solidity/deploy';
import { Environment } from '~/utils/environment/Environment';

export const deploy0xAdapter = async (environment?: Environment) => {
  const address = await deploy(
    'exchanges/ZeroExV2Adapter.sol',
    null,
    environment,
  );

  return address;
};
