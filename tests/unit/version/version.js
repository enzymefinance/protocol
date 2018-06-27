import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../../utils/lib/signing";

const BN = web3.utils.BN;
const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let manager;
let opts;

const fundName = web3.utils.toHex("Super Fund");

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  [ , manager] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.deployed = await deployEnvironment(environment);
  t.context.version = t.context.deployed.Version;
  const [r, s, v] = await getTermsSignatureParameters(manager);
  console.log(`TERMS SIGNED WEB3: ${await t.context.version.methods.termsAndConditionsAreSigned(v, r, s).call({from: manager})}`);
  t.context.tx = await t.context.version.methods.setupFund(
    fundName,
    t.context.deployed.MlnToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    t.context.deployed.NoCompliance.options.address,
    t.context.deployed.RMMakeOrders.options.address,
    [t.context.deployed.MatchingMarket.options.address],
    [],
    v,
    r,
    s,
  ).send(opts);
});

test("Can setup a new fund", async t => {
  console.log(t.context.tx);
  const receipt = await api.eth.getTransactionReceipt(t.context.txId);
  const fundAddress = api.util.toChecksumAddress(`0x${receipt.logs[0].data.slice(-40)}`);
  const fundOwned = await t.context.version.instance.managerToFunds.call({}, [manager]);

  t.is(fundOwned, fundAddress);
});

test("Can shutdown a fund", async t => {
  const lastFundId = await t.context.version.instance.getLastFundId.call({}, []);
  const lastFund = await t.context.version.instance.listOfFunds.call({}, [lastFundId]);
  await t.context.version.instance.shutDownFund.postTransaction(opts, [lastFund]);
  const fundOwned = await t.context.version.instance.managerToFunds.call({}, [manager]);
  t.is(fundOwned, "0x0000000000000000000000000000000000000000");
});
