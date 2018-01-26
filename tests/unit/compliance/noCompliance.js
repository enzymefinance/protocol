import test from "ava";
import api from "../../../utils/lib/api";
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
  accounts = await api.eth.accounts();
  [investor] = accounts;
});

test("Anyone can perform subscription", async t => {
  const isSubscriptionPermitted = await compliance.instance.isSubscriptionPermitted.call(
    {},
    [investor, 100, 100],
  );
  t.truthy(isSubscriptionPermitted);
});

test("Anyone can perform redemption", async t => {
  const isRedemptionPermitted = await compliance.instance.isRedemptionPermitted.call(
    {},
    [investor, 100, 100],
  );
  t.truthy(isRedemptionPermitted);
});
