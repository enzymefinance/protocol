import { providers } from 'ethers';
import { deployPersistent } from './deployment';

export async function defaultPersistetTestDeployment(
  provider: providers.JsonRpcProvider,
) {
  const [deployer, ...others] = await provider.listAccounts();
  const accounts = others
    .slice(0, 10) // Only prepare a maximum of ten accounts.
    .map((address) => provider.getSigner(address));

  const config = {
    deployer: provider.getSigner(deployer),
  };

  const deployment = await deployPersistent(config);

  return { accounts, config, deployment };
}
