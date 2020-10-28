import { providers } from 'ethers';
import { deployPersistent } from '../persistent';
import { deployRelease } from './deployment';
import { configureForkRelease } from './fork';
import { configureMockRelease, deployMocks } from './mocks';

async function getSigners(
  provider: providers.JsonRpcProvider,
  limit: number = 10,
) {
  const addresses = await provider.listAccounts();
  return addresses
    .slice(0, limit) // Only prepare a maximum of ten accounts.
    .map((address) => provider.getSigner(address));
}

export async function defaultTestDeployment(
  provider: providers.JsonRpcProvider,
) {
  const [deployer, mgm, ...accounts] = await getSigners(provider);

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

export async function defaultForkDeployment(
  provider: providers.JsonRpcProvider,
) {
  const [deployer, mgm, ...accounts] = await getSigners(provider, 5);

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
