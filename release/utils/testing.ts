import { providers } from 'ethers';
import { randomAddress } from '@crestproject/crestproject';
import { deployPersistent } from '@melonproject/persistent';
import { deployRelease } from './deployment';
import { deployMocks } from './mocks';

export async function defaultTestDeployment(
  provider: providers.JsonRpcProvider,
) {
  const [deployer, mtc, mgm, ...others] = await provider.listAccounts();
  const accounts = others
    .slice(0, 10) // Only prepare a maximum of ten accounts.
    .map((address) => provider.getSigner(address));

  const common = {
    deployer: provider.getSigner(deployer),
    mgm,
    mtc,
  };

  const persistent = await deployPersistent(common);
  const mocks = await deployMocks({
    ...common,
    accounts,
  });

  const config = {
    ...common,
    dispatcher: persistent.dispatcher.address,
    mln: mocks.tokens.mln.address,
    weth: mocks.tokens.weth.address,
    engine: {
      thawDelay: 10000000000,
      etherTakers: [randomAddress()], // What's this?!
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

  const release = await deployRelease(config);

  await persistent.dispatcher
    .connect(provider.getSigner(config.mtc))
    .setCurrentFundDeployer(release.fundDeployer);

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
