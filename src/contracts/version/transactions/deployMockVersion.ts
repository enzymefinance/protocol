import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployMockVersion = async (environment?: Environment) => {
  const address = await deployContract(
    'version/MockVersion.sol',
    null,
    environment,
  );

  return address;
};
