import test from "ava";
import api from "../../../utils/lib/api";
import { deployContract } from "../../../utils/lib/contracts";

let deployer;
let user;

const amount = 1000000000000;

test.before(async () => {
  const accounts = await api.eth.accounts();
  [deployer, user] = accounts;
});

test.beforeEach(async t => {
  t.context.picopsCertifier = await deployContract("modules/SimpleCertifier");
  t.context.picopsCompliance = await deployContract(
    "compliance/PicopsCompliance",
    { from: deployer },
    [t.context.picopsCertifier.address],
  );
});

test("Checks if investment is permitted", async t => {
  const investmentPermittedBeforeCertify = await t.context.picopsCompliance.instance.isInvestmentPermitted.call(
    {},
    [user, amount, amount],
  );
  await t.context.picopsCertifier.instance.certify.postTransaction(
    { from: deployer },
    [user],
  );
  const investmentPermittedAfterCertify = await t.context.picopsCompliance.instance.isInvestmentPermitted.call(
    {},
    [user, amount, amount],
  );
  t.is(investmentPermittedBeforeCertify, false);
  t.is(investmentPermittedAfterCertify, true);
});

test("Checks if redemption permitted", async t => {
  const redemptionPermittedBeforeCertify = await t.context.picopsCompliance.instance.isRedemptionPermitted.call(
    {},
    [user, amount, amount],
  );
  await t.context.picopsCertifier.instance.certify.postTransaction(
    { from: deployer },
    [user],
  );
  const redemptionPermittedAfterCertify = await t.context.picopsCompliance.instance.isRedemptionPermitted.call(
    {},
    [user, amount, amount],
  );
  t.is(redemptionPermittedBeforeCertify, false);
  t.is(redemptionPermittedAfterCertify, true);
});
