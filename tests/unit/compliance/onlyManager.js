import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../../utils/lib/signing";
import {deployContract, retrieveContract} from "../../../utils/lib/contracts";

const environment = "development";

// hoisted variables TODO: replace with t.context object
let manager;
let investor;
let version;
let fund;
let compliance;
let deployed;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  const accounts = await api.eth.accounts();
  [manager, investor] = accounts;
  compliance = await deployContract("compliance/OnlyManager");
  version = deployed.Version;
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction({from: manager, gas: 6000000}, [
    'Some Fund',
    deployed.MlnToken.address,
    0,
    0,
    compliance.address,
    deployed.RMMakeOrders.address,
    [deployed.MatchingMarket.address],
    v,
    r,
    s
  ]);
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
});

test("Manager can request investment", async t => {
  const txid = await fund.instance.requestInvestment.postTransaction({from: manager, gas: 6000000}, [100, 100, deployed.MlnToken.address]);
  const requestId = parseInt((await api.eth.getTransactionReceipt(txid)).logs[0].data, 16);   // get request ID from log
  const request = await fund.instance.requests.call({}, [Number(requestId)]);

  t.is(request[0], manager);
  t.not(Number(request[7]), 0);
});

test("Someone who is not manager can not request investment", async t => {
  const txid = await fund.instance.requestInvestment.postTransaction({from: investor, gas: 6000000}, [100, 100, deployed.MlnToken.address]);
  const logsArrayLength = (await api.eth.getTransactionReceipt(txid)).logs.length; // get length of logs (0 if tx failed)
  // TODO: check for actual throw in tx receipt (waiting for parity.js to support this: https://github.com/paritytech/js-api/issues/16)

  t.is(logsArrayLength, 0);
});

test("Anyone can perform redemption", async t => {
  const isManagerRedemptionPermitted = await compliance.instance.isRedemptionPermitted.call(
    {}, [manager, 100, 100],
  );
  const isInvestorRedemptionPermitted = await compliance.instance.isRedemptionPermitted.call(
    {}, [investor, 100, 100],
  );

  t.true(isManagerRedemptionPermitted);
  t.true(isInvestorRedemptionPermitted);
});
