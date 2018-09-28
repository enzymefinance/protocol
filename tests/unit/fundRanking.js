import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../utils/lib/signing";
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

const fundNames = [web3.utils.padLeft(web3.utils.toHex('Fund Name 1'), 34), web3.utils.padLeft(web3.utils.toHex('Fund Name 2'), 34),];

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager] = accounts;
  version = deployed.Version;
  fundRanking = deployed.FundRanking;
});

test.beforeEach(async () => {
  // Fund Setup 1
  let [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    fundNames[0], // name of the fund
    deployed.MlnToken.options.address, // reference asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [],
    v,
    r,
    s,
  ).send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });

  // Fund Setup 2
  [r, s, v] = await getTermsSignatureParameters(deployer);
  await version.methods.setupFund(
    fundNames[1], // name of the fund
    deployed.MlnToken.options.address, // reference asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [],
    v,
    r,
    s,
  ).send({ from: deployer, gas: config.gas, gasPrice: config.gasPrice });
  await updateCanonicalPriceFeed(deployed);
});

// test to check getFundDetails() method
test('get address, shareprice, time and name of all funds in a version', async (t) => {
  const fundDetails = await fundRanking.methods.getFundDetails(version.options.address).call();
  const fundAddresses = [];
  fundAddresses[0] = await version.methods.getFundById(0).call();
  fundAddresses[1] = await version.methods.getFundById(1).call();
  fundNames.forEach((name, i) => {
    t.is(fundDetails[0][i], fundAddresses[i]);
    t.not(Number(fundDetails[1][i]), 0);
    t.not(Number(fundDetails[2][i]), 0);
    t.is(fundDetails[3][i].substr(0, name.length), name);
  });
});
