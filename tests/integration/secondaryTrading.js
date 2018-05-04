/* import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let fund;
let investor;
let manager;
let mlnToken;
let simpleMarket;
let simpleAdapter;
let version;
let deployed;

// mock data
const offeredValue = new BigNumber(10 ** 10);
const wantedShares = new BigNumber(10 ** 10);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor, ,] = accounts;
  version = await deployed.Version;
  mlnToken = await deployed.MlnToken;
  simpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", {from: deployer});
  simpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", {from: deployer});
  await governanceAction(
    { from: deployer },
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [simpleMarket.address, simpleAdapter.address, true, []],
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Suisse Fund",
      deployed.MlnToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [simpleMarket.address],
      [],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);

  // investment by investor
  const initialTokenAmount = new BigNumber(10 ** 15);
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, offeredValue],
  );
  await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [offeredValue, wantedShares, mlnToken.address],
  );
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
});

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);
});

test.serial(
  "Investor cannot transfer his shares directly to an exchange",
  async t => {
    const preShares = await fund.instance.balanceOf.call({}, [investor]);
    await fund.instance.transfer.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [simpleMarket.address, new BigNumber(10 ** 5), ""],
    );
    const postShares = await fund.instance.balanceOf.call({}, [investor]);
    t.deepEqual(preShares, postShares);
  },
);

test.serial("Investor cannot give allowance to his shares", async t => {
  await fund.instance.approve.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [simpleMarket.address, new BigNumber(10 ** 5)],
  );
  const allowance = await fund.instance.allowance.call({}, [
    simpleMarket.address,
    investor,
  ]);
  t.is(allowance.toNumber(), 0);
});
*/
