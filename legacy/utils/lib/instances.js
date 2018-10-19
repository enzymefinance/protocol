import Api from "@parity/api";

const fs = require("fs");
const addressBook = require("../../addressBook.json");
const environmentConfig = require("../config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);
const addresses = addressBook[environment];

// retrieve deployed contracts
export const version = api.newContract(
  JSON.parse(fs.readFileSync("out/version/Version.abi")),
  addresses.Version,
);

export const datafeed = api.newContract(
  JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi")),
  addresses.PriceFeed,
);

export const mlnToken = api.newContract(
  JSON.parse(fs.readFileSync("out/assets/PreminedAsset.abi")),
  addresses.MlnToken,
);

export const ethToken = api.newContract(
  JSON.parse(fs.readFileSync("out/assets/PreminedAsset.abi")),
  addresses.EthToken,
);

export const eurToken = api.newContract(
  JSON.parse(fs.readFileSync("out/assets/PreminedAsset.abi")),
  addresses.EurToken,
);

export const participation = api.newContract(
  JSON.parse(fs.readFileSync("out/compliance/NoCompliance.abi")),
  addresses.NoCompliance,
);

export const simpleMarket = api.newContract(
  JSON.parse(fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi")),
  addresses.SimpleMarket,
);

export const accounts = api.eth.accounts();
