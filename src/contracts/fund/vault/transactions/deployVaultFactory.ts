import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployVaultFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'fund/vault/VaultFactory.sol',
    null,
  );

  return address;
};
