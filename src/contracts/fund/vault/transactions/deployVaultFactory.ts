import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployVaultFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/vault/VaultFactory.sol',
    null,
    environment,
  );

  return address;
};
