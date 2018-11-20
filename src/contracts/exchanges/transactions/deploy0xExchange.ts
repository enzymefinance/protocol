import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deploy0xExchange = async (environment?: Environment) => {
  const address = await deployContract(
    'exchanges/thirdparty/0x/Exchange.sol',
    [],
    environment,
  );

  return address;
};
