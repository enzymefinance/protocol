import { DeployFunction } from 'hardhat-deploy/types';
import {
  AggregatedDerivativePriceFeed,
  AggregatedDerivativePriceFeedArgs,
  CentralizedRateProvider,
  ChainlinkPriceFeed,
  ChainlinkPriceFeedArgs,
  ChaiPriceFeedArgs,
  CompoundPriceFeed,
  CompoundPriceFeedArgs,
  SynthetixPriceFeed,
  SynthetixPriceFeedArgs,
  UniswapV2PoolPriceFeed,
  UniswapV2PoolPriceFeedArgs,
  ValueInterpreterArgs,
  WdgldPriceFeedArgs,
} from '@enzymefinance/protocol';
import { loadConfig } from './config/Config';

function nonOptional<T>(array: (T | undefined)[]): T[] {
  return array.filter((item) => item !== undefined) as T[];
}

const fn: DeployFunction = async function (hre) {
  const { deploy, get, getOrNull, log } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const config = await loadConfig(hre);

  const dispatcher = await get('Dispatcher');

  const chaiPriceFeed = await deploy('ChaiPriceFeed', {
    from: deployer.address,
    log: true,
    args: [config.chai.chai, config.chai.dai, config.chai.pot] as ChaiPriceFeedArgs,
  });

  const wdgldPriceFeed = await deploy('WdgldPriceFeed', {
    from: deployer.address,
    log: true,
    args: [config.wdgld.wdgld, config.weth, config.wdgld.ethusd, config.wdgld.xauusd] as WdgldPriceFeedArgs,
  });

  // NOTE: Primitives are registered after the contract deployment.
  const chainlinkPriceFeed = await deploy('ChainlinkPriceFeed', {
    from: deployer.address,
    log: true,
    args: [dispatcher.address, config.weth, config.chainlink.ethusd, [], [], []] as ChainlinkPriceFeedArgs,
  });

  // NOTE: Compound tokens are registered after the contract deployment.
  const compoundPriceFeed = await deploy('CompoundPriceFeed', {
    from: deployer.address,
    log: true,
    args: [dispatcher.address, config.weth, config.compound.ceth, []] as CompoundPriceFeedArgs,
  });

  // NOTE: Synths are registered after the contract deployment.
  const synthetixPriceFeed = await deploy('SynthetixPriceFeed', {
    from: deployer.address,
    log: true,
    args: [dispatcher.address, config.synthetix.addressResolver, config.synthetix.susd, []] as SynthetixPriceFeedArgs,
  });

  // NOTE: Derivatives are registered after the contract deployment.
  const derivativePriceFeed = await deploy('AggregatedDerivativePriceFeed', {
    from: deployer.address,
    log: true,
    args: [dispatcher.address, [], []] as AggregatedDerivativePriceFeedArgs,
  });

  const valueInterpreter = await deploy('ValueInterpreter', {
    from: deployer.address,
    log: true,
    args: [chainlinkPriceFeed.address, derivativePriceFeed.address] as ValueInterpreterArgs,
  });

  // NOTE: Pool tokens are registered after the contract deployment.
  const uniswapPriceFeed = await deploy('UniswapV2PoolPriceFeed', {
    from: deployer.address,
    log: true,
    args: [
      dispatcher.address,
      derivativePriceFeed.address,
      chainlinkPriceFeed.address,
      valueInterpreter.address,
      config.uniswap.factory,
      [],
    ] as UniswapV2PoolPriceFeedArgs,
  });

  // Register all primitives with the chainlink price feed.
  const chainlinkPriceFeedInstance = new ChainlinkPriceFeed(chainlinkPriceFeed.address, deployer);
  const chainlinkAssetsNeedingRegistration = nonOptional(
    await Promise.all(
      Object.entries(config.primitives).map(async ([key, address]) => {
        return (await chainlinkPriceFeedInstance.isSupportedAsset(address)) ? undefined : key;
      }),
    ),
  ).map((key) => {
    if (!config.chainlink.aggregators[key]) {
      throw new Error(`Missing aggregator for ${key}`);
    }

    const aggregator = config.chainlink.aggregators[key];
    const primitive = config.primitives[key];
    return [primitive, ...aggregator] as const;
  });

  if (!hre.network.live || hre.network.name === 'kovan') {
    const oneYear = 60 * 60 * 24 * 365;
    const currentStaleRateThreshold = await chainlinkPriceFeedInstance.getStaleRateThreshold();
    if (!currentStaleRateThreshold.eq(oneYear)) {
      log('Setting stale rate threshold to one year for testing');
      await chainlinkPriceFeedInstance.setStaleRateThreshold(oneYear);
    }
  }

  // NOTE: This does not account for primitives that would need to be updated (changed aggregator or rate asset).
  if (!!chainlinkAssetsNeedingRegistration.length) {
    log('Registering new primitives', chainlinkAssetsNeedingRegistration);
    const primitives = chainlinkAssetsNeedingRegistration.map(([primitive]) => primitive);
    const aggregators = chainlinkAssetsNeedingRegistration.map(([, aggregator]) => aggregator);
    const rateAssets = chainlinkAssetsNeedingRegistration.map(([, , rateAsset]) => rateAsset);
    await chainlinkPriceFeedInstance.addPrimitives(primitives, aggregators, rateAssets);
  } else {
    log('All primitives already registered');
  }

  // Register all ctokens with the compound price feed.
  const compoundPriceFeedInstance = new CompoundPriceFeed(compoundPriceFeed.address, deployer);
  const compoundAssetsNeedingRegistration = nonOptional(
    await Promise.all(
      Object.values(config.compound.ctokens).map(async (ctoken) => {
        return (await compoundPriceFeedInstance.isSupportedAsset(ctoken)) ? undefined : ctoken;
      }),
    ),
  );

  if (!!compoundAssetsNeedingRegistration.length) {
    log('Registering new compound tokens', compoundAssetsNeedingRegistration);
    await compoundPriceFeedInstance.addCTokens(compoundAssetsNeedingRegistration);
  } else {
    log('All compound tokens already registered');
  }

  // Register all synths with the synthetix price feed.
  const synthetixPriceFeedInstance = new SynthetixPriceFeed(synthetixPriceFeed.address, deployer);
  const synthetixAssetsNeedingRegistration = nonOptional(
    await Promise.all(
      Object.values(config.synthetix.synths).map(async (synth) => {
        return (await synthetixPriceFeedInstance.isSupportedAsset(synth)) ? undefined : synth;
      }),
    ),
  );

  if (!!synthetixAssetsNeedingRegistration.length) {
    log('Registering new synths', synthetixAssetsNeedingRegistration);
    await synthetixPriceFeedInstance.addSynths(synthetixAssetsNeedingRegistration);
  } else {
    log('All synths already registered');
  }

  // Register all derivatives except pool tokens.
  const derivativePriceFeedInstance = new AggregatedDerivativePriceFeed(derivativePriceFeed.address, deployer);
  const derivativeAssets: [string, string][] = [
    [config.wdgld.wdgld, wdgldPriceFeed.address],
    [config.chai.chai, chaiPriceFeed.address],
    [config.compound.ceth, compoundPriceFeed.address],
    ...Object.values(config.synthetix.synths).map((synth) => [synth, synthetixPriceFeed.address] as [string, string]),
    ...Object.values(config.compound.ctokens).map((ctoken) => [ctoken, compoundPriceFeed.address] as [string, string]),
  ];

  const derivativeAssetsNeedingRegistration = nonOptional(
    await Promise.all(
      derivativeAssets.map(async (asset) => {
        const [derivative] = asset;
        return (await derivativePriceFeedInstance.isSupportedAsset(derivative)) ? undefined : asset;
      }),
    ),
  );

  if (!!derivativeAssetsNeedingRegistration.length) {
    log('Registering new non-pool derivatives', derivativeAssetsNeedingRegistration);
    const derivatives = derivativeAssetsNeedingRegistration.map(([derivative]) => derivative);
    const feeds = derivativeAssetsNeedingRegistration.map(([, feed]) => feed);
    await derivativePriceFeedInstance.addDerivatives(derivatives, feeds);
  } else {
    log('All non-pool derivatives already registered');
  }

  // Register all uniswap pool tokens with the uniswap price feed.
  const uniswapPriceFeedInstance = new UniswapV2PoolPriceFeed(uniswapPriceFeed.address, deployer);
  const uniswapPoolsNeedingRegistration = nonOptional(
    await Promise.all(
      Object.values(config.uniswap.pools).map(async (pool) => {
        return (await uniswapPriceFeedInstance.isSupportedAsset(pool)) ? undefined : pool;
      }),
    ),
  );

  if (!!uniswapPoolsNeedingRegistration.length) {
    log('Registering new uniswap pool tokens', uniswapPoolsNeedingRegistration);
    await uniswapPriceFeedInstance.addPoolTokens(uniswapPoolsNeedingRegistration);
  } else {
    log('All uniswap pool tokens already registered');
  }

  // Register all uniswap pool tokens with the derivative price feed.
  const uniswapPoolsNeedingDerivativeRegistration = nonOptional(
    await Promise.all(
      Object.values(config.uniswap.pools).map(async (pool) => {
        return (await derivativePriceFeedInstance.isSupportedAsset(pool)) ? undefined : pool;
      }),
    ),
  );

  if (!!uniswapPoolsNeedingDerivativeRegistration.length) {
    log('Registering new uniswap pool derivatives', uniswapPoolsNeedingDerivativeRegistration);
    const derivatives = uniswapPoolsNeedingDerivativeRegistration;
    const feeds = uniswapPoolsNeedingDerivativeRegistration.map(() => uniswapPriceFeed.address);
    await derivativePriceFeedInstance.addDerivatives(derivatives, feeds);
  } else {
    log('All uniswap pool derivatives already registered');
  }

  const centralizedRateProvider = await getOrNull('mocks/CentralizedRateProvider');
  if (!!centralizedRateProvider) {
    const centralizedRateProviderInstance = new CentralizedRateProvider(centralizedRateProvider.address, deployer);
    await centralizedRateProviderInstance.setReleasePriceAddresses(
      valueInterpreter.address,
      derivativePriceFeed.address,
      chainlinkPriceFeed.address,
    );
  }
};

fn.tags = ['Release', 'Prices'];
fn.dependencies = ['Config', 'Dispatcher', 'ValueInterpreter'];

export default fn;
