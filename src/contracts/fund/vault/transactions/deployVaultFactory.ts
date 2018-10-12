import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployVaultFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/trading/VaultFactory.sol',
    null,
    environment,
  );

  return address;
};

export default deployVaultFactory;
