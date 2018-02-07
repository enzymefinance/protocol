import test from "ava";
import api from "../../../utils/lib/api";
import {deployContract} from "../../../utils/lib/contracts";

let accounts;
let simpleCertifier;
let picopsCompliance;
let deployer;

test.before(async () => {
  accounts = await api.eth.accounts();
  [deployer] = accounts;
  simpleCertifier = await deployContract("modules/SimpleCertifier");
});

test.beforeEach(async () => {
  picopsCompliance = await deployContract(
    "compliance/PicopsCompliance",
    {from: deployer},
    [simpleCertifier.address]
  );
});

test('Checks if subscription is permitted', async (t) => {
  accounts = await api.eth.accounts();
  const beforeSubscriptionPermitted = await picopsCompliance.instance
    .isSubscriptionPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  await simpleCertifier.instance.certify.postTransaction({from: accounts[0]}, [accounts[1]]);
  const subscriptionPermitted = await picopsCompliance.instance
    .isSubscriptionPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  t.is(beforeSubscriptionPermitted, false);
  t.is(subscriptionPermitted, true);
});

test('Checks if redemption permitted', async (t) => {
  accounts = await api.eth.accounts();
  const beforeRedemptionPermitted = await picopsCompliance.instance
    .isRedemptionPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  await simpleCertifier.instance.certify.postTransaction({ from: accounts[0] }, [accounts[1]]);
  const redemptionPermitted = await picopsCompliance.instance
    .isRedemptionPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  t.is(beforeRedemptionPermitted, false);
  t.is(redemptionPermitted, true);
});
