import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { deployPersistent } from './deployment';

export async function defaultPersistetTestDeployment(provider: EthereumTestnetProvider) {
  const [deployer, ...accounts] = await Promise.all([
    provider.getSignerWithAddress(0),
    provider.getSignerWithAddress(1),
    provider.getSignerWithAddress(2),
    provider.getSignerWithAddress(3),
    provider.getSignerWithAddress(4),
    provider.getSignerWithAddress(5),
    provider.getSignerWithAddress(6),
    provider.getSignerWithAddress(7),
    provider.getSignerWithAddress(8),
    provider.getSignerWithAddress(9),
  ]);

  const config = {
    deployer,
  };

  const deployment = await deployPersistent(config);

  return { accounts, config, deployment };
}
