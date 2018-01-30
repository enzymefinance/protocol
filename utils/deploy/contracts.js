import * as fs from "fs";
import * as pkgInfo from "../../package.json";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
import {deployContract, retrieveContract} from "../lib/contracts";
import api from "../lib/api";

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
  let addressBook;
  const deployed = {};
  if (fs.existsSync(addressBookFile)) {
    addressBook = JSON.parse(fs.readFileSync(addressBookFile));
  } else addressBook = {};

  if (environment === "kovan") {
    const mlnAddr = `0x${tokenInfo[environment].find(t => t.symbol === "MLN-T").address}`;
    const ethTokenAddress = `0x${tokenInfo[environment].find(t => t.symbol === "ETH-T").address}`;

    deployed.PriceFeed = await deployContract("pricefeeds/PriceFeed",
      opts, [
      mlnAddr,
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
    // deployed.SimpleMarket = await retrieveContract("exchange/thirdparty/SimpleMarket", '0x7B1a19E7C84036503a177a456CF1C13e0239Fc02');
    // console.log(`Using already-deployed SimpleMarket at ${deployed.SimpleMarket.address}\n`);

    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
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
      config.protocol.registrar.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
        await deployed.PriceFeed.instance.register
          .postTransaction({from: accounts[0]}, [
            `0x${tokenEntry.address}`,
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

    addressBook[environment] = {
      PriceFeed: deployed.PriceFeed.address,
      SimpleMarket: deployed.SimpleMarket.address,
      NoCompliance: deployed.NoCompliance.address,
      RMMakeOrders: deployed.RMMakeOrders.address,
      Governance: deployed.Governance.address,
      SimpleAdapter: deployed.SimpleAdapter.address,
      CentralizedAdapter: deployed.CentralizedAdapter.address,
      Version: deployed.Version.address,
      FundRanking: deployed.FundRanking.address
    };
  } else if (environment === "live") {
    const mlnAddr = `0x${tokenInfo[environment].find(t => t.symbol === "MLN").address}`;
    const ethTokenAddress = `0x${tokenInfo[environment].find(t => t.symbol === "OW-ETH").address}`;

    deployed.PriceFeed = await deployContract("pricefeeds/PriceFeed", opts, [
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
      config.protocol.registrar.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
        await deployed.PriceFeed.instance.register
          .postTransaction({from: accounts[0], gas: 6000000}, [
            `0x${tokenEntry.address}`,
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

    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);

    deployed.Governance = await deployContract("system/Governance", opts, [
      [config.protocol.governance.authority],
      1,
      yearInSeconds
    ]);

    deployed.Version = await deployContract("version/Version", Object.assign(opts, {gas: 6700000}), [pkgInfo.version, deployed.Governance.address, ethTokenAddress], () => {}, true);

    // add Version to Governance tracking
    await deployed.Governance.instance.proposeVersion.postTransaction({from: config.protocol.governance.authority}, [deployed.Version.address]);
    await deployed.Governance.instance.approveVersion.postTransaction({from: config.protocol.governance.authority}, [deployed.Version.address]);
    await deployed.Governance.instance.triggerVersion.postTransaction({from: config.protocol.governance.authority}, [deployed.Version.address]);

    // TODO: cleaner way to write to address book (maybe can do it dynamically)
    // TODO: make backup of previous addressbook
    addressBook[environment] = {
      PriceFeed: deployed.PriceFeed.address,
      NoCompliance: deployed.NoCompliance.address,
      RMMakeOrders: deployed.RMMakeOrders.address,
      SimpleAdapter: deployed.SimpleAdapter.address,
      Governance: deployed.Governance.address,
      Version: deployed.Version.address,
    };
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

    addressBook[environment] = {
      PriceFeed: deployed.PriceFeed.address,
      SimpleMarket: deployed.SimpleMarket.address,
      NoCompliance: deployed.NoCompliance.address,
      RMMakeOrders: deployed.RMMakeOrders.address,
      Governance: deployed.Governance.address,
      SimpleAdapter: deployed.SimpleAdapter.address,
      CentralizedAdapter: deployed.CentralizedAdapter.address,
      Version: deployed.Version.address,
      MlnToken: deployed.MlnToken.address,
      EurToken: deployed.EurToken.address,
      EthToken: deployed.EthToken.address,
      FundRanking: deployed.FundRanking.address
    };
  }

  // write out addressBook
  console.log(`Writing addresses to ${addressBookFile}`);
  fs.writeFileSync(
    addressBookFile,
    JSON.stringify(addressBook, null, "\t"),
    "utf8",
  );

  return deployed;  // return instances of contracts we just deployed
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify a deployment environment`);
  } else {
    deployEnvironment(environment)
    .catch(err => console.error(err.stack))
    .finally(() => process.exit())
  }
}

export default deployEnvironment;
