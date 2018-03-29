import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getSignatureParameters from "../../utils/lib/getSignatureParameters";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";

const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

let accounts
let fundRanking;
let deployed;
let version;
let manager;
let deployer;

const fundNames = ["Fund Name 1", "Fund Name 2"];

// To convert bytes to string
function bytesToString(bytes){
  let result = "";
  for(let i = 0; i < bytes.length; i += 1){
    const convertedChar = (String.fromCharCode(bytes[i]));
    if (convertedChar === "\u0000") {
      break;
    }
    result+= convertedChar;
  }
  return result;
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager] = accounts;
  version = deployed.Version;
  fundRanking = deployed.FundRanking;
});

test.beforeEach(async () => {
  // Fund Setup 1
  let [r, s, v] = await getSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundNames[0], // name of the fund
      deployed.MlnToken.address, // reference asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      v,
      r,
      s,
    ],
  );

  // Fund Setup 2
  [r, s, v] = await getSignatureParameters(deployer);
  await version.instance.setupFund.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundNames[1], // name of the fund
      deployed.MlnToken.address, // reference asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      v,
      r,
      s,
    ],
  );
  await updateCanonicalPriceFeed(deployed);
});

// test to check getFundDetails() method
test('get address, shareprice, time and name of all funds in a version', async (t) => {
  accounts = await api.eth.accounts();
  const fundDetails = await fundRanking.instance.getFundDetails.call({}, [version.address]);
  const fundAddresses = [];
  fundAddresses[0] = await version.instance.getFundById.call({}, [0]);
  fundAddresses[1] = await version.instance.getFundById.call({}, [1]);
  fundNames.forEach((name, i) => {
    t.is(fundDetails[0][i]._value, fundAddresses[i]);
    t.not(Number(fundDetails[1][i]._value), 0);
    t.not(Number(fundDetails[2][i]._value), 0);
    t.is(bytesToString(fundDetails[3][i]._value), name);
  });
});
