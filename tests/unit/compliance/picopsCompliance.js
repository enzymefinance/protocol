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

test('Checks if investment is permitted', async (t) => {
  accounts = await api.eth.accounts();
  const beforeInvestmentPermitted = await picopsCompliance.instance
    .isInvestmentPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  t.is(beforeInvestmentPermitted, false);
  await simpleCertifier.instance.certify.postTransaction({from: accounts[0]}, [accounts[1]]);
  const investmentPermitted = await picopsCompliance.instance
    .isInvestmentPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  t.is(investmentPermitted, true);
});

test('Checks if redemption permitted', async (t) => {
  accounts = await api.eth.accounts();
  const beforeRedemptionPermitted = await picopsCompliance.instance
    .isRedemptionPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  t.is(beforeRedemptionPermitted, false);
  await simpleCertifier.instance.certify.postTransaction({ from: accounts[0] }, [accounts[1]]);
  const redemptionPermitted = await picopsCompliance.instance
    .isRedemptionPermitted.call({}, [accounts[1], 1000000000000000000, 1000000000000000000]);
  t.is(redemptionPermitted, true);
});
