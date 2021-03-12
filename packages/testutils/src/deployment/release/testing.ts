import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import { Dispatcher, FundDeployer, ReleaseStatusTypes } from '@enzymefinance/protocol';
import { deployRelease } from './deployment';
import { configureMockRelease, deployMocks } from './mocks';

export async function defaultTestDeployment(provider: EthereumTestnetProvider) {
  const [deployer, ...accounts] = await Promise.all([
    provider.getSignerWithAddress(0),
    provider.getSignerWithAddress(1),
    provider.getSignerWithAddress(2),
    provider.getSignerWithAddress(3),
    provider.getSignerWithAddress(4),
  ]);

  const dispatcher = await Dispatcher.deploy(deployer);
  const mocks = await deployMocks({ deployer, accounts });
  const config = await configureMockRelease({
    dispatcher,
    deployer,
    mocks,
    accounts,
  });

  const release = await deployRelease(config);

  await mocks.centralizedRateProvider.setReleasePriceAddresses(
    release.valueInterpreter,
    release.aggregatedDerivativePriceFeed,
    release.chainlinkPriceFeed,
  );

  await release.integrationManager.registerAdapters([mocks.mockGenericAdapter]);

  // Keep this as the final step
  await launchRelease({
    dispatcher,
    fundDeployer: release.fundDeployer,
  });

  return {
    config,
    accounts,
    deployment: {
      dispatcher,
      ...mocks,
      ...release,
    },
  };
}

export async function randomizedTestDeployment(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);
  {
    await deployment.centralizedRateProvider.setMaxDeviationPerSender(10);
    await deployment.kyberIntegratee.setBlockNumberDeviation(3);
    await deployment.uniswapV2Integratee.setBlockNumberDeviation(3);
  }
  return {
    config,
    accounts,
    deployment,
  };
}

async function launchRelease({ dispatcher, fundDeployer }: { dispatcher: Dispatcher; fundDeployer: FundDeployer }) {
  await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Live);
  await dispatcher.setCurrentFundDeployer(fundDeployer);
}
