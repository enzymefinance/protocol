import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";

const environment = "development";

// hoisted variables
let accounts;
let mockAddress;
let riskLevel;
let referencePrice;
let riskMgmt;

test.before(async () => {
  const deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [mockAddress] = accounts;
  riskMgmt = deployed.RMMakeOrders;
  riskLevel = await riskMgmt.methods.RISK_LEVEL().call();
  referencePrice = 100;
});

test("Make order should be permitted for a high orderPrice w.r.t referencePrice", async t => {
  const orderPrice = referencePrice * 2;
  const isMakePermitted = await riskMgmt.methods.isMakePermitted(
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ).call();
  const isTakePermitted = await riskMgmt.methods.isTakePermitted(
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ).call();

  t.true(isMakePermitted);
  t.true(isTakePermitted);
});

test("Make order should be permitted for the cutoff orderPrice w.r.t referencePrice", async t => {
  const orderPrice =
    referencePrice - (referencePrice * riskLevel) / 10 ** 18;
  const isMakePermitted = await riskMgmt.methods.isMakePermitted(
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ).call();

  const isTakePermitted = await riskMgmt.methods.isTakePermitted(
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ).call();

  t.true(isMakePermitted);
  t.true(isTakePermitted);
});

test("Make and take orders should not be permitted for a low orderPrice w.r.t referencePrice", async t => {
  const orderPrice =
    referencePrice -
    (referencePrice * (riskLevel / (10 ** 18) + 0.1));
  const isMakePermitted = await riskMgmt.methods.isMakePermitted(
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ).call();

  const isTakePermitted = await riskMgmt.methods.isTakePermitted(
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ).call();

  t.false(isMakePermitted);
  t.false(isTakePermitted);
});
