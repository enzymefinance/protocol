const conf = require('../deploy-config.js');
const BN = web3.utils.BN;

const KyberAdapter = artifacts.require('KyberAdapter');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');
const EngineAdapter = artifacts.require('EngineAdapter');
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

// TODO: split this file into multiple migrations
module.exports = async deployer => {
  const tokenAddrs = input.tokens.addr;

  await deployer.deploy(KyberAdapter);
  await deployer.deploy(OasisDexAdapter);
  await deployer.deploy(UniswapAdapter);
  await deployer.deploy(ZeroExV2Adapter);
  await deployer.deploy(ZeroExV3Adapter);
  await deployer.deploy(EngineAdapter);
  await deployer.deploy(PriceTolerance, melonConf.priceTolerance);
  await deployer.deploy(UserWhitelist, melonConf.userWhitelist);
  const managementFee = await deployer.deploy(ManagementFee);
  const performanceFee = await deployer.deploy(PerformanceFee);
  const accountingFactory = await deployer.deploy(AccountingFactory);
  const feeManagerFactory = await deployer.deploy(FeeManagerFactory);
  const policyManagerFactory = await deployer.deploy(PolicyManagerFactory);
  const sharesFactory = await deployer.deploy(SharesFactory);
  const vaultFactory = await deployer.deploy(VaultFactory);
  const registry = await deployer.deploy(Registry, melonConf.registryOwner);
  const engine = await deployer.deploy(Engine, melonConf.engineDelay, registry.options.address);
  const sharesRequestor = await deployer.deploy(SharesRequestor, registry.options.address);

  let priceSource;
  if (conf.track === 'KYBER_PRICE') { // TODO: what to do about "tracks"
    priceSource = await deployer.deploy(
      KyberPriceFeed,
      registry.options.address,
      input.kyber.addr.KyberNetworkProxy, // TODO: fix these addresses
      melonConf.maxSpread,
      tokenAddrs.WETH,
      melonConf.initialUpdater
    );
  } else if (conf.track === 'TESTING') {
    priceSource = await deployer.deploy(TestingPriceFeed, tokenAddrs.WETH, input.tokens.conf.WETH.decimals);
  }

  await registry.setPriceSource(priceSource.options.address);
  await registry.setNativeAsset(tokenAddrs.WETH);
  await registry.setMlnToken(tokenAddrs.MLN);
  await registry.setEngine(engine.options.address);
  await registry.setMGM(melonConf.initialMGM);
  await registry.setSharesRequestor(sharesRequestor.options.address);
  await registry.registerFees(
    [
      managementFee.options.address,
      performanceFee.options.address
    ]
  );

  // TODO: lift metadata.js and constants.js from tests/utils into a shared utils file in root
  const takeOrderSignature = 'takeOrder(address,address[8],uint256[8],bytes[4],bytes32,bytes)';
  const sigs = [web3.eth.abi.encodeFunctionSignature(takeOrderSignature)];

  for (const info of Object.values(exchanges)) {
    const isRegistered = await registry.exchangeAdapterIsRegistered(info.adapter);
    // TODO: check here if we actually need to update as well
    if (isRegistered) {
      await registry.updateExchangeAdapter(info.exchange, info.adapter, sigs);
    } else {
      await registry.registerExchangeAdapter(info.exchange, info.adapter, sigs)
    }
  }

  for (const [sym, info] of Object.entries(input.tokens.conf)) {
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
    accountingFactory.options.address,
    feeManagerFactory.options.address,
    sharesFactory.options.address,
    vaultFactory.options.address,
    policyManagerFactory.options.address,
    registry.options.address,
    melonConf.fundFactoryOwner
  );

  const fundFactoryInformation = await registry.fundFactoryInformation(fundFactory.options.address);

  if (!fundFactoryInformation.exists) {
    let fundFactoryName;
    if (conf.track === 'TESTING') {
      fundFactoryName = web3.utils.padLeft(web3.utils.toHex(`${Date.now()}`), 64);
    } else {
      fundFactoryName = web3.utils.padLeft(web3.utils.toHex(melonConf.versionName), 64);
    }
    await registry.registerFundFactory(fundFactory.options.address, fundFactoryName);
  }

  if (conf.track === 'KYBER_PRICE')
    await priceSource.update();
  else if (conf.track === 'TESTING') {
    // TODO: get actual prices
    const fakePrices = Object.values(tokenAddrs).map(() => (new BN('10')).pow(new BN('18')).toString());
    await priceSource.update(Object.values(tokenAddrs), fakePrices);
  }
}
