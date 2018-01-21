import test from "ava";
import Api from "@parity/api";
import { participation as compliance } from "../../../utils/lib/utils";
import deploy from "../../../utils/deploy/contracts";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let investor;

test.before(async () => {
  await deploy(environment);
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
