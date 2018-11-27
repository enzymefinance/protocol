import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployVaultFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/vault/VaultFactory.sol',
    null,
    environment,
  );

  return address;
};
