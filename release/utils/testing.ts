import {
  deployPersistent,
  PersistentDeploymentConfig,
  PersistentDeploymentOutput,
} from '@melonproject/persistent';
import { Deployment, DeploymentHandlers } from '@melonproject/utils';
import { providers, Signer } from 'ethers';
import { deployRelease, ReleaseDeploymentConfig } from './deployment';
import {
  deployMocks,
  MockDeploymentConfig,
  MockDeploymentOutput,
} from './mocks';

interface CommonDeploymentConfig {
  deployer: Signer;
  mgm: string;
}

type PersistentDeployment = Deployment<
  DeploymentHandlers<PersistentDeploymentConfig, PersistentDeploymentOutput>
>;

type MockDeployment = Deployment<
  DeploymentHandlers<MockDeploymentConfig, MockDeploymentOutput>
>;

export async function configureRelease(
  common: CommonDeploymentConfig,
  persistent: PersistentDeployment,
  mocks: MockDeployment,
) {
  return {
    ...common,
    dispatcher: persistent.dispatcher.address,
    mln: mocks.tokens.mln.address,
    weth: mocks.tokens.weth.address,
    registeredVaultCalls: {
      contracts: [],
      selectors: [],
    },
    engine: {
      thawDelay: 10000000000,
    },
    chainlink: {
      rateQuoteAsset: mocks.tokens.weth.address,
      aggregators: Object.values(mocks.chainlinkPriceSources).map(
        (aggregator) => aggregator.address,
      ),
      primitives: Object.keys(mocks.chainlinkPriceSources).map(
        (symbol) => (mocks.tokens as any)[symbol].address,
      ),
    },
    integratees: {
      chai: mocks.chaiIntegratee.address,
      kyber: mocks.kyberIntegratee.address,
      makerDao: {
        dai: mocks.tokens.dai.address,
        pot: mocks.chaiPriceSource.address,
      },
    },
  };
}

export async function defaultTestDeployment(
  provider: providers.JsonRpcProvider,
  configure?: (
    config: ReleaseDeploymentConfig,
  ) => Promise<ReleaseDeploymentConfig> | ReleaseDeploymentConfig,
) {
  const [deployer, mgm, ...others] = await provider.listAccounts();
  const accounts = others
    .slice(0, 10) // Only prepare a maximum of ten accounts.
    .map((address) => provider.getSigner(address));

  const common = {
    deployer: provider.getSigner(deployer),
    mgm,
  };

  const persistent = await deployPersistent(common);
  const mocks = await deployMocks({
    ...common,
    accounts,
  });

  const config = await configureRelease(common, persistent, mocks);
  const release = await deployRelease((await configure?.(config)) ?? config);

  await persistent.dispatcher.setCurrentFundDeployer(release.fundDeployer);

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
