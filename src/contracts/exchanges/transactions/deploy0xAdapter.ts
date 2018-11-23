import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deploy0xAdapter = async (environment?: Environment) => {
  const address = await deployContract(
    'exchanges/ZeroExV2Adapter.sol',
    null,
    environment,
  );

  return address;
};
