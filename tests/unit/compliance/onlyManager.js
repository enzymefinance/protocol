import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import {deployContract, retrieveContract} from "../../../utils/lib/contracts";

const addressBook = require("../../../addressBook.json"); // TODO: maybe should import this after new deployment (below)

const environment = "development";
const addresses = addressBook[environment];

// hoisted variables TODO: replace with t.context object
let manager;
let investor;
let version;
let fund;
let compliance;

test.before(async () => {
  await deployEnvironment(environment);
  const accounts = await api.eth.accounts();
  [manager, investor] = accounts;

  // acquire params for setupFund (TODO: outsource this to convenience function)
  const hash =
    "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;

  compliance = await deployContract("compliance/OnlyManager");
  version = await retrieveContract("version/Version", addresses.Version);
  await version.instance.setupFund.postTransaction({from: manager, gas: 6000000}, [
    'Some Fund',
    addresses.MlnToken,
    0,
    0,
    compliance.address,
    addresses.RMMakeOrders,
    addresses.PriceFeed,
    [addresses.SimpleMarket],
    [addresses.SimpleAdapter],
    v,
    r,
    s
  ]);
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
});

test("Manager can request subscription", async t => {
  const txid = await fund.instance.requestSubscription.postTransaction({from: manager, gas: 6000000}, [100, 100, false]);
  const requestId = parseInt((await api.eth.getTransactionReceipt(txid)).logs[0].data, 16);   // get request ID from log
  const request = await fund.instance.requests.call({}, [Number(requestId)]);

  t.is(request[0], manager);
  t.not(Number(request[7]), 0);
});

test("Someone who is not manager can not request subscription", async t => {
  const txid = await fund.instance.requestSubscription.postTransaction({from: investor, gas: 6000000}, [100, 100, false]);
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

