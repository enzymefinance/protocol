import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";

const environment = "development";

// hoisted variables
let accounts;
let investor;
let compliance;

test.before(async () => {
  // TODO: do we need to re-deploy everything here? maybe just the compliance module
  const deployed = await deployEnvironment(environment);
  compliance = deployed.NoCompliance;
  accounts = await web3.eth.getAccounts();
  [investor] = accounts;
});

test("Anyone can perform investment", async t => {
  const isInvestmentPermitted = await compliance.methods.isInvestmentPermitted(investor, 100, 100).call();
  t.true(isInvestmentPermitted);
});

test("Anyone can perform redemption", async t => {
  const isRedemptionPermitted = await compliance.methods.isRedemptionPermitted(investor, 100, 100).call();
  t.true(isRedemptionPermitted);
});
