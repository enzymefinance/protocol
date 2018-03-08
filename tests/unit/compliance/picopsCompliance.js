import test from "ava";
import api from "../../../utils/lib/api";
import { deployContract } from "../../../utils/lib/contracts";

let accounts;
let picopsCertifier;
let picopsCompliance;
let deployer;

test.before(async () => {
  accounts = await api.eth.accounts();
  [deployer] = accounts;
  picopsCertifier = await deployContract("modules/picopsCertifier");
});

test.beforeEach(async () => {
  picopsCompliance = await deployContract(
    "compliance/PicopsCompliance",
    { from: deployer },
    [picopsCertifier.address],
  );
});

test("Checks if investment is permitted", async t => {
  accounts = await api.eth.accounts();
  const investmentPermittedBeforeCertify = await picopsCompliance.instance.isInvestmentPermitted.call(
    {},
    [accounts[1], 1000000000000000000, 1000000000000000000],
  );
  await picopsCertifier.instance.certify.postTransaction(
    { from: accounts[0] },
    [accounts[1]],
  );
  const investmentPermittedAfterCertify = await picopsCompliance.instance.isInvestmentPermitted.call(
    {},
    [accounts[1], 1000000000000000000, 1000000000000000000],
  );
  t.is(investmentPermittedBeforeCertify, false);
  t.is(investmentPermittedAfterCertify, true);
});

test("Checks if redemption permitted", async t => {
  accounts = await api.eth.accounts();
  const redemptionPermittedBeforeCertify = await picopsCompliance.instance.isRedemptionPermitted.call(
    {},
    [accounts[1], 1000000000000000000, 1000000000000000000],
  );
  await picopsCertifier.instance.certify.postTransaction(
    { from: accounts[0] },
    [accounts[1]],
  );
  const redemptionPermittedAfterCertify = await picopsCompliance.instance.isRedemptionPermitted.call(
    {},
    [accounts[1], 1000000000000000000, 1000000000000000000],
  );
  t.is(redemptionPermittedBeforeCertify, false);
  t.is(redemptionPermittedAfterCertify, true);
});
