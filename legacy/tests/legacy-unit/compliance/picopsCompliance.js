import test from "ava";
import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let deployer;
let user;
let opts;

const amount = 1000000000000;

test.before(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, user] = accounts;
  opts = { from: deployer, gas:8000000 }
});

test.beforeEach(async t => {
  t.context.picopsCertifier = await deployContract("modules/SimpleCertifier", opts);
  t.context.picopsCompliance = await deployContract(
    "compliance/PicopsCompliance",
    opts,
    [t.context.picopsCertifier.options.address],
  );
});

test("Checks if investment is permitted", async t => {
  const investmentPermittedBeforeCertify = await t.context.picopsCompliance.methods.isInvestmentPermitted(user, amount, amount).call();
  await t.context.picopsCertifier.methods.certify(user).send(
    { from: deployer }
  );
  const investmentPermittedAfterCertify = await t.context.picopsCompliance.methods.isInvestmentPermitted(user, amount, amount).call(
    {},
  );
  t.is(investmentPermittedBeforeCertify, false);
  t.is(investmentPermittedAfterCertify, true);
});

test("Checks if redemption permitted", async t => {
  const redemptionPermittedBeforeCertify = await t.context.picopsCompliance.methods.isRedemptionPermitted(user, amount, amount).call();
  await t.context.picopsCertifier.methods.certify(user).send(
    { from: deployer }
  );
  const redemptionPermittedAfterCertify = await t.context.picopsCompliance.methods.isRedemptionPermitted(user, amount, amount).call();
  t.is(redemptionPermittedBeforeCertify, false);
  t.is(redemptionPermittedAfterCertify, true);
});
