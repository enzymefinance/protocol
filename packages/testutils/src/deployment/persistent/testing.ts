import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import { deployPersistent } from './deployment';

export async function defaultPersistentTestDeployment(provider: EthereumTestnetProvider) {
  const [deployer, ...accounts] = await Promise.all([
    provider.getSignerWithAddress(0),
    provider.getSignerWithAddress(1),
    provider.getSignerWithAddress(2),
    provider.getSignerWithAddress(3),
    provider.getSignerWithAddress(4),
  ]);

  const config = {
    deployer,
  };

  const deployment = await deployPersistent(config);

  return { accounts, config, deployment };
}
