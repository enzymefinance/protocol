import test from "ava";
import Api from "@parity/api";
import { riskMgmt } from "../../../utils/lib/utils";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let mockAddress;
let riskLevel;
let referencePrice;

test.before(async () => {
  accounts = await api.eth.accounts();
  mockAddress = accounts[1];
  riskLevel = await riskMgmt.instance.RISK_LEVEL.call({}, []);
  referencePrice = 100;
});

test("Make order should be permitted for a high orderPrice w.r.t referencePrice", async t => {
  const orderPrice = referencePrice * 2;
  const isMakePermitted = await riskMgmt.instance.isMakePermitted.call({}, [
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ]);
  const isTakePermitted = await riskMgmt.instance.isTakePermitted.call({}, [
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ]);

  t.truthy(isMakePermitted);
  t.truthy(isTakePermitted);
});

test("Make order should be permitted for the cutoff orderPrice w.r.t referencePrice", async t => {
  const orderPrice =
    referencePrice - referencePrice * riskLevel.div(10 ** 18).toNumber();
  const isMakePermitted = await riskMgmt.instance.isMakePermitted.call({}, [
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ]);
  const isTakePermitted = await riskMgmt.instance.isTakePermitted.call({}, [
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ]);

  t.truthy(isMakePermitted);
  t.truthy(isTakePermitted);
});

test("Make and take orders should not be permitted for a low orderPrice w.r.t referencePrice", async t => {
  const orderPrice =
    referencePrice -
    (referencePrice * riskLevel.div(10 ** 18).toNumber() + 0.1);
  const isMakePermitted = await riskMgmt.instance.isMakePermitted.call({}, [
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ]);
  const isTakePermitted = await riskMgmt.instance.isTakePermitted.call({}, [
    orderPrice,
    referencePrice,
    mockAddress,
    mockAddress,
    100,
    100,
  ]);

  t.falsy(isMakePermitted);
  t.falsy(isTakePermitted);
});
