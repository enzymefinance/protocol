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
const MatchingMarket = artifacts.require('MatchingMarket');
const ZeroExV2Exchange = artifacts.require('ZeroExV2Exchange');
const ZeroExV3Exchange = artifacts.require('ZeroExV3Exchange');
// const AirSwapSwap = artifacts.require('AirSwapSwap');
const UniswapFactory = artifacts.require('UniswapFactory');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

// TODO: split this file into multiple migrations
module.exports = async deployer => {
  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const mln = await MLN.at(mainnetAddrs.tokens.MLN);
  const kyberNetworkProxy = await KyberNetworkProxy.at(mainnetAddrs.kyber.KyberNetworkProxy);
  const matchingMarket = await MatchingMarket.at(mainnetAddrs.oasis.OasisDexExchange);
  const uniswapFactory = await UniswapFactory.at(mainnetAddrs.uniswap.UniswapFactory);
  const zeroExV2Exchange = await ZeroExV2Exchange.at(mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  const zeroExV3Exchange = await ZeroExV3Exchange.at(mainnetAddrs.zeroExV3.ZeroExV3Exchange);

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
      kyberNetworkProxy.address,
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
  await registry.registerFee(managementFee.address);
  await registry.registerFee(performanceFee.address);

  // TODO: lift metadata.js and constants.js from tests/utils into a shared utils file in root
  const takeOrderSignature = 'takeOrder(address,address[8],uint256[8],bytes[4],bytes32,bytes)';
  const sigs = [web3.eth.abi.encodeFunctionSignature(takeOrderSignature)];

//   let exchanges = {};

//   exchanges.engine = {
//     exchange: (await Engine.deployed()).address,
//     adapter: (await EngineAdapter.deployed()).address
//   };
//   // exchanges.airSwap = {
//   //   exchange: (await AirSwapSwap.deployed()).address,
//   //   adapter: (await AirSwapAdapter.deployed()).address
//   // };
//   exchanges.kyber = {
//     exchange: kyberNetworkProxy.address,
//     adapter: (await KyberAdapter.deployed()).address
//   };
//   exchanges.oasis = {
//     exchange: matchingMarket.address,
//     adapter: (await OasisDexAdapter.deployed()).address
//   };
//   // TODO
//   exchanges.uniswap = {
//     exchange: uniswapFactory.address,
//     adapter: (await UniswapAdapter.deployed()).address
//   };
//   exchanges.zeroExV2 = {
//     exchange: zeroExV2Exchange.address,
//     adapter: (await ZeroExV2Adapter.deployed()).address
//   };
//   exchanges.zeroExV3 = {
//     exchange: zeroExV3Exchange.address,
//     adapter: (await ZeroExV3Adapter.deployed()).address
//   };

  const integrations = {};
  integrations.engine = {
    gateway: (await Engine.deployed()).address,
    adapter: (await EngineAdapter.deployed()).address,
    integrationType: 0,
  };
  // integrations.airSwap = {
  //   gateway: input.airSwap.addr.Swap,
  //   adapter: airSwapAdapter.options.address,
  //   integrationType: 1
  // };
  integrations.kyber = {
    gateway: kyberNetworkProxy.address,
    adapter: (await KyberAdapter.deployed()).address,
    integrationType: 1
  };
  integrations.oasis = {
    gateway: matchingMarket.address,
    adapter: (await OasisDexAdapter.deployed()).address,
    integrationType: 1
  };
  integrations.uniswap = {
    gateway: uniswapFactory.address,
    adapter: (await UniswapAdapter.deployed()).address,
    integrationType: 1
  };
  integrations.zeroExV2 = {
    gateway: zeroExV2Exchange.address,
    adapter: (await ZeroExV2Adapter.deployed()).address,
    integrationType: 1
  };
  integrations.zeroExV3 = {
    gateway: zeroExV3Exchange.address,
    adapter: (await ZeroExV3Adapter.deployed()).address,
    integrationType: 1
  };

  for (const info of Object.values(integrations)) {
    if (!(await registry.integrationAdapterIsRegistered(info.adapter))) {
      await registry.registerIntegrationAdapter(info.adapter, info.gateway, info.integrationType);
    }
  }

  for (const tokenAddress of Object.values(mainnetAddrs.tokens)) {
    const alreadyRegistered = await registry.assetIsRegistered(tokenAddress);
    if (!alreadyRegistered) {
      await registry.registerAsset(tokenAddress);
    }
  }

  const fundFactory = await deployer.deploy(
    FundFactory,
    feeManagerFactory.address,
    sharesFactory.address,
    vaultFactory.address,
    policyManagerFactory.address,
    registry.address,
    conf.melonFundFactoryOwner
  );

  await registry.setFundFactory(fundFactory.address);

  if (conf.track === 'KYBER_PRICE')
    await priceSource.update();
  else if (conf.track === 'TESTING') {
    // // TODO: get actual prices
    // const fakePrices = Object.values(tokenAddrs).map(() => (new BN('10')).pow(new BN('18')).toString());
    // await priceSource.update(Object.values(tokenAddrs), fakePrices);
  }
}
