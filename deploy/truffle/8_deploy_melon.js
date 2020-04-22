const conf = require('../deploy-config.js');
const BN = web3.utils.BN;

const KyberAdapter = artifacts.require('KyberAdapter');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');
const EngineAdapter = artifacts.require('EngineAdapter');
const AirSwapAdapter = artifacts.require('AirSwapSwap');
const PriceTolerance = artifacts.require('PriceTolerance');
const UserWhitelist = artifacts.require('UserWhitelist');
const ManagementFee = artifacts.require('ManagementFee');
const PerformanceFee = artifacts.require('PerformanceFee');
const AccountingFactory = artifacts.require('AccountingFactory');
const FeeManagerFactory = artifacts.require('FeeManagerFactory');
const PolicyManagerFactory = artifacts.require('PolicyManagerFactory');
const SharesFactory = artifacts.require('SharesFactory');
const VaultFactory = artifacts.require('VaultFactory');
const Registry = artifacts.require('Registry');
const Engine = artifacts.require('Engine');
const SharesRequestor = artifacts.require('SharesRequestor');
const FundFactory = artifacts.require('FundFactory');
const KyberPriceFeed = artifacts.require('KyberPriceFeed');
const TestingPriceFeed = artifacts.require('TestingPriceFeed');
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const MLN = artifacts.require('MLN');
const WETH = artifacts.require('WETH');
const OasisDexExchange = artifacts.require('OasisDexExchange');
const ZeroExV2Exchange = artifacts.require('ZeroExV2Exchange');
const ZeroExV3Exchange = artifacts.require('ZeroExV3Exchange');
// const AirSwapSwap = artifacts.require('AirSwapSwap');
// const UniswapFactory = artifacts.require('UniswapFactory');

// TODO: split this file into multiple migrations
module.exports = async deployer => {
  const weth = await WETH.deployed();
  const mln = await MLN.deployed();

  await deployer.deploy(KyberAdapter);
  await deployer.deploy(OasisDexAdapter);
  await deployer.deploy(UniswapAdapter);
  await deployer.deploy(ZeroExV2Adapter);
  await deployer.deploy(ZeroExV3Adapter);
  // await deployer.deploy(AirSwapAdapter); // TODO
  await deployer.deploy(EngineAdapter);
  await deployer.deploy(PriceTolerance, conf.melonPriceTolerance);
  await deployer.deploy(UserWhitelist, conf.melonUserWhitelist);

  const managementFee = await deployer.deploy(ManagementFee);
  const performanceFee = await deployer.deploy(PerformanceFee);
  const accountingFactory = await deployer.deploy(AccountingFactory);
  const feeManagerFactory = await deployer.deploy(FeeManagerFactory);
  const policyManagerFactory = await deployer.deploy(PolicyManagerFactory);
  const sharesFactory = await deployer.deploy(SharesFactory);
  const vaultFactory = await deployer.deploy(VaultFactory);
  const registry = await deployer.deploy(Registry, conf.melonRegistryOwner);
  const engine = await deployer.deploy(Engine, conf.melonEngineDelay, registry.address);
  const sharesRequestor = await deployer.deploy(SharesRequestor, registry.address);

  let priceSource;
  if (conf.track === 'KYBER_PRICE') { // TODO: what to do about "tracks"
    priceSource = await deployer.deploy(
      KyberPriceFeed,
      registry.address,
      (await KyberNetworkProxy.deployed()).address,
      conf.melonMaxSpread,
      weth.address,
      conf.melonInitialUpdater
    );
  } else if (conf.track === 'TESTING') {
    priceSource = await deployer.deploy(TestingPriceFeed, weth.address, 18);
  }

  await registry.setPriceSource(priceSource.address);
  await registry.setNativeAsset(weth.address);
  await registry.setMlnToken(mln.address);
  await registry.setEngine(engine.address);
  await registry.setMGM(conf.melonInitialMGM);
  await registry.setSharesRequestor(sharesRequestor.address);
  await registry.registerFees(
    [
      managementFee.address,
      performanceFee.address
    ]
  );

  // TODO: lift metadata.js and constants.js from tests/utils into a shared utils file in root
  const takeOrderSignature = 'takeOrder(address,address[8],uint256[8],bytes[4],bytes32,bytes)';
  const sigs = [web3.eth.abi.encodeFunctionSignature(takeOrderSignature)];

  let exchanges = {};

  exchanges.engine = {
    exchange: (await Engine.deployed()).address,
    adapter: (await EngineAdapter.deployed()).address
  };
  // exchanges.airSwap = {
  //   exchange: (await AirSwapSwap.deployed()).address,
  //   adapter: (await AirSwapAdapter.deployed()).address
  // };
  exchanges.kyber = {
    exchange: (await KyberNetworkProxy.deployed()).address,
    adapter: (await KyberAdapter.deployed()).address
  };
  exchanges.oasis = {
    exchange: (await MatchingMarket.deployed()).address,
    adapter: (await OasisDexAdapter.deployed()).address
  };
  // TODO
  // exchanges.uniswap = {
  //   exchange: (await UniswapFactory.deployed()).address,
  //   adapter: (await UniswapAdapter.deployed()).address
  // };
  exchanges.zeroExV2 = {
    exchange: (await ZeroExV2Exchange.deployed()).address,
    adapter: (await ZeroExV2Adapter.deployed()).address
  };
  exchanges.zeroExV3 = {
    exchange: (await ZeroExV3Exchange.deployed()).address,
    adapter: (await ZeroExV3Adapter.deployed()).address
  };


  for (const info of Object.values(exchanges)) {
    const isRegistered = await registry.exchangeAdapterIsRegistered(info.adapter);
    // TODO: check here if we actually need to update as well
    if (isRegistered) {
      await registry.updateExchangeAdapter(info.exchange, info.adapter, sigs);
    } else {
      await registry.registerExchangeAdapter(info.exchange, info.adapter, sigs)
    }
  }

  for (const [sym, info] of Object.entries(conf.tokens)) {
    const tokenAddress = tokenAddrs[sym];
    const assetInfo = await registry.assetInformation(tokenAddress);
    const reserveMin = info.reserveMin || '0';
    if (!assetInfo.exists) {
      await registry.registerAsset(
        tokenAddress,
        info.name,
        sym,
        '',
        reserveMin,
        [],
        []
      );
    } else {
      await registry.updateAsset(
        tokenAddress,
        info.name,
        sym,
        '',
        reserveMin,
        [],
        []
      );
    }
    if (conf.track === 'TESTING') {
      await priceSource.setDecimals(tokenAddress, info.decimals);
    }
  }

  const fundFactory = await deployer.deploy(
    FundFactory,
    accountingFactory.address,
    feeManagerFactory.address,
    sharesFactory.address,
    vaultFactory.address,
    policyManagerFactory.address,
    registry.address,
    conf.melonFundFactoryOwner
  );

  const fundFactoryInformation = await registry.fundFactoryInformation(fundFactory.address);

  if (!fundFactoryInformation.exists) {
    let fundFactoryName;
    if (conf.track === 'TESTING') {
      fundFactoryName = web3.utils.padLeft(web3.utils.toHex(`${Date.now()}`), 64);
    } else {
      fundFactoryName = web3.utils.padLeft(web3.utils.toHex(conf.melonVersionName), 64);
    }
    await registry.registerFundFactory(fundFactory.address, fundFactoryName);
  }

  if (conf.track === 'KYBER_PRICE')
    await priceSource.update();
  else if (conf.track === 'TESTING') {
    // TODO: get actual prices
    const fakePrices = Object.values(tokenAddrs).map(() => (new BN('10')).pow(new BN('18')).toString());
    await priceSource.update(Object.values(tokenAddrs), fakePrices);
  }
}
