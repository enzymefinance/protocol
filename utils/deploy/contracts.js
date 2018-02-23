import * as fs from "fs";
import * as pkgInfo from "../../package.json";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
// import * as exchangeInfo from "../info/exchangeInfo";
import {deployContract} from "../lib/contracts";
import api from "../lib/api";
import unlock from "../lib/unlockAccount";

const addressBookFile = "./addressBook.json";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const yearInSeconds = 60 * 60 * 24 * 365;

// TODO: make clearer the separation between deployments in different environments
// TODO: make JSdoc style documentation tags here
async function deployEnvironment(environment) {
  const config = masterConfig[environment];
  if (config === undefined) {
    throw new Error(`Deployment for environment ${environment} not defined`);
  } else {
    const nodeNetId = await api.net.version();
    if(nodeNetId !== config.networkId && config.networkId !== "*") {
      throw new Error(`Network ID of node (${nodeNetId}) did not match ID in config "${environment}" (${config.networkId})`);
    }
  }
  const accounts = await api.eth.accounts();
  const opts = {
    from: accounts[0],
    gas: config.gas,
    gasPrice: config.gasPrice,
  };

  const deployed = {};
  let txid;

  if (environment === "kovan") {
    // const oasisDexAddress = exchangeInfo[environment].find(e => e.name === "OasisDex").address;
    const mlnAddr = tokenInfo[environment].find(t => t.symbol === "MLN-T-M").address;
    const ethTokenAddress = tokenInfo[environment].find(t => t.symbol === "ETH-T-M").address;

    deployed.PriceFeed = await deployContract("pricefeeds/PriceFeed",
      opts, [
      mlnAddr,
      'Melon Token',
      'MLN-T-M',
      18,
      'melonport.com',
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
      config.protocol.pricefeed.interval,
      config.protocol.pricefeed.validity,
    ]);

    // deployed.SimpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", opts);
    // deployed.SimpleMarket = await retrieveContract("exchange/thirdparty/SimpleMarket", '0x7B1a19E7C84036503a177a456CF1C13e0239Fc02');
    // console.log(`Using already-deployed SimpleMarket at ${deployed.SimpleMarket.address}\n`);

    deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [1546304461]); // number is first day of 2019 (expiration date for market)

    const pairsToWhitelist = [
      ['MLN-T-M', 'ETH-T-M'],
      ['MLN-T-M', 'MKR-T-M'],
      ['MLN-T-M', 'DAI-T-M'],
    ];
    await Promise.all(
      pairsToWhitelist.map(async (pair) => {
        console.log(`Whitelisting ${pair}`);
        const tokenA = tokenInfo[environment].find(t => t.symbol === pair[0]).address;
        const tokenB = tokenInfo[environment].find(t => t.symbol === pair[1]).address;
        await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(opts, [tokenA, tokenB]);
      })
    );

    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.OnlyManager = await deployContract("compliance/OnlyManager", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, yearInSeconds]);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);
    deployed.CentralizedAdapter = await deployContract("exchange/adapter/CentralizedAdapter", opts);
    deployed.Version = await deployContract("version/Version", Object.assign(opts, {gas: 6900000}), [pkgInfo.version, deployed.Governance.address, ethTokenAddress], () => {}, true);
    deployed.FundRanking = await deployContract("FundRanking", opts, [deployed.Version.address]);

    // add Version to Governance tracking
    await deployed.Governance.instance.proposeVersion.postTransaction({from: accounts[0]}, [deployed.Version.address]);
    await deployed.Governance.instance.approveVersion.postTransaction({from: accounts[0]}, [deployed.Version.address]);
    await deployed.Governance.instance.triggerVersion.postTransaction({from: accounts[0]}, [deployed.Version.address]);

    // register assets
    await Promise.all(
      config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
        await deployed.PriceFeed.instance.register
          .postTransaction({from: accounts[0]}, [
            tokenEntry.address,
            tokenEntry.name,
            tokenEntry.symbol,
            tokenEntry.decimals,
            tokenEntry.url,
            mockBytes,
            mockBytes,
            mockAddress,
            mockAddress,
        ]);
        console.log(`Registered ${assetSymbol}`);
      })
    );
  } else if (environment === "live") {
    const deployer = config.protocol.deployer;
    // const deployerPassword = '/path/to/password/file';
    const pricefeedOperator = config.protocol.pricefeed.operator;
    const pricefeedOperatorPassword = '/path/to/password/file';
    const authority = config.protocol.governance.authority;
    const authorityPassword = '/path/to/password/file';
    const mlnAddr = tokenInfo[environment].find(t => t.symbol === "MLN").address;
    const ethTokenAddress = tokenInfo[environment].find(t => t.symbol === "W-ETH").address;

    await unlock(pricefeedOperator, pricefeedOperatorPassword);
    deployed.PriceFeed = await deployContract("pricefeeds/PriceFeed", {from: pricefeedOperator}, [
        mlnAddr,
        'Melon Token',
        'MLN',
        18,
        'melonport.com',
        mockBytes,
        mockBytes,
        mockAddress,
        mockAddress,
        config.protocol.pricefeed.interval,
        config.protocol.pricefeed.validity,
    ]);

    // register assets
    await Promise.all(
      config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        await unlock(pricefeedOperator, pricefeedOperatorPassword);
        const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
        await deployed.PriceFeed.instance.register
          .postTransaction({from: pricefeedOperator, gas: 6000000}, [
            tokenEntry.address,
            tokenEntry.name,
            tokenEntry.symbol,
            tokenEntry.decimals,
            tokenEntry.url,
            mockBytes,
            mockBytes,
            mockAddress,
            mockAddress,
        ]);
        console.log(`Registered ${assetSymbol}`);
      })
    );

    deployed.OnlyManager = await deployContract("compliance/OnlyManager", {from: deployer});
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", {from: deployer});
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", {from: deployer});
    deployed.Governance = await deployContract("system/Governance", {from: deployer}, [
      [config.protocol.governance.authority],
      1,
      yearInSeconds
    ]);

    deployed.Version = await deployContract("version/Version", {from: deployer, gas: 6900000}, [pkgInfo.version, deployed.Governance.address, ethTokenAddress], () => {}, true);

    // add Version to Governance tracking
    await unlock(authority, authorityPassword);
    txid = await deployed.Governance.instance.proposeVersion.postTransaction({from: config.protocol.governance.authority}, [deployed.Version.address]);
    await deployed.Governance._pollTransaction(txid);
    await unlock(authority, authorityPassword);
    txid = await deployed.Governance.instance.approveVersion.postTransaction({from: config.protocol.governance.authority}, [deployed.Version.address]);
    await deployed.Governance._pollTransaction(txid);
    await unlock(authority, authorityPassword);
    txid = await deployed.Governance.instance.triggerVersion.postTransaction({from: config.protocol.governance.authority}, [deployed.Version.address]);
    await deployed.Governance._pollTransaction(txid);

    deployed.Fundranking = await deployContract("FundRanking", {from: deployer}, [deployed.Version.address]);
  } else if (environment === "development") {
    deployed.EthToken = await deployContract("assets/PreminedAsset", opts);
    console.log("Deployed ether token");
    deployed.MlnToken = await deployContract("assets/PreminedAsset", opts);
    console.log("Deployed melon token");
    deployed.EurToken = await deployContract("assets/PreminedAsset", opts);
    console.log("Deployed euro token");

    deployed.PriceFeed = await deployContract("pricefeeds/PriceFeed", opts, [
      deployed.MlnToken.address,
      'Melon Token',
      'MLN-T',
      18,
      'melonport.com',
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
      config.protocol.pricefeed.interval,
      config.protocol.pricefeed.validity,
    ]);

    deployed.SimpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", opts);
    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, 100000]);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);
    deployed.CentralizedAdapter = await deployContract("exchange/adapter/CentralizedAdapter", opts);
    deployed.Version = await deployContract("version/Version", Object.assign(opts, {gas: 6900000}), [pkgInfo.version, deployed.Governance.address, deployed.EthToken.address], () => {}, true);
    deployed.FundRanking = await deployContract("FundRanking", opts, [deployed.Version.address]);

    // add Version to Governance tracking
    await deployed.Governance.instance.proposeVersion.postTransaction({from: accounts[0]}, [deployed.Version.address]);
    await deployed.Governance.instance.approveVersion.postTransaction({from: accounts[0]}, [deployed.Version.address]);
    await deployed.Governance.instance.triggerVersion.postTransaction({from: accounts[0]}, [deployed.Version.address]);
    console.log('Version added to Governance');

    // register assets
    await deployed.PriceFeed.instance.register.postTransaction({}, [
      deployed.EthToken.address,
      "Ether token",
      "ETH-T",
      18,
      "ethereum.org",
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
    ]);
    await deployed.PriceFeed.instance.register.postTransaction({}, [
      deployed.EurToken.address,
      "Euro token",
      "EUR-T",
      18,
      "europa.eu",
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
    ]);
    await deployed.PriceFeed.instance.register.postTransaction({}, [
      deployed.MlnToken.address,
      "Melon token",
      "MLN-T",
      18,
      "melonport.com",
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
    ]);
    console.log("Done registration");
  }
  return deployed;  // return instances of contracts we just deployed
}

// takes `deployed` object as defined above, and environment to write to
async function writeToAddressBook(deployedContracts, environment) {
  let addressBook;
  if (fs.existsSync(addressBookFile)) {
    addressBook = JSON.parse(fs.readFileSync(addressBookFile));
  } else addressBook = {};

  const namesToAddresses = {};
  Object.keys(deployedContracts)
    .forEach(key => {
      namesToAddresses[key] = deployedContracts[key].address
    });
  addressBook[environment] = namesToAddresses;

  fs.writeFileSync(
    addressBookFile,
    JSON.stringify(addressBook, null, '  '),
    'utf8'
  );
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify an environment using the environment variable CHAIN_ENV`);
  } else {
    deployEnvironment(environment)
    .then(deployedContracts => writeToAddressBook(deployedContracts, environment))
    .catch(err => console.error(err.stack))
    .finally(() => process.exit())
  }
}

export default deployEnvironment;
