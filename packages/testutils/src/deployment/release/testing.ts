import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { deployPersistent } from '../persistent';
import { deployRelease } from './deployment';
import { configureForkRelease } from './fork';
import { configureMockRelease, deployMocks } from './mocks';

export async function defaultTestDeployment(provider: EthereumTestnetProvider) {
  const [deployer, mgm, ...accounts] = await Promise.all([
    provider.getSignerWithAddress(0),
    provider.getSignerWithAddress(1),
    provider.getSignerWithAddress(3),
    provider.getSignerWithAddress(4),
    provider.getSignerWithAddress(5),
    provider.getSignerWithAddress(6),
    provider.getSignerWithAddress(7),
    provider.getSignerWithAddress(8),
    provider.getSignerWithAddress(9),
  ]);

  const persistent = await deployPersistent({ deployer });
  const mocks = await deployMocks({ deployer, accounts });
  const config = await configureMockRelease({
    dispatcher: persistent.dispatcher,
    deployer,
    mgm,
    mocks,
    accounts,
  });

  const release = await deployRelease(config);
  await persistent.dispatcher.setCurrentFundDeployer(release.fundDeployer);
  await release.integrationManager.registerAdapters([mocks.mockGenericAdapter]);

  return {
    config,
    accounts,
    deployment: {
      ...mocks,
      ...persistent,
      ...release,
    },
  };
}

export async function defaultForkDeployment(provider: EthereumTestnetProvider) {
  const [deployer, mgm, ...accounts] = await Promise.all([
    provider.getSignerWithAddress(0),
    provider.getSignerWithAddress(1),
    provider.getSignerWithAddress(2),
    provider.getSignerWithAddress(3),
    provider.getSignerWithAddress(4),
  ]);

  const persistent = await deployPersistent({ deployer });
  const config = await configureForkRelease({
    provider,
    dispatcher: persistent.dispatcher,
    deployer,
    mgm,
    accounts,
  });

  const release = await deployRelease(config);

  await persistent.dispatcher.setCurrentFundDeployer(release.fundDeployer);

  return {
    config,
    accounts,
    deployment: {
      ...persistent,
      ...release,
    },
  };
}
