import test from 'ava';
import api from "../../../utils/lib/api";
import {deployContract} from "../../../utils/lib/contracts";
import deployEnvironment from "../../../utils/deploy/contracts";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

let accounts;
let deployer;
let opts;
let governance;
let version;
let deployed;

async function activateVersion(t) {
  const calldata = api.util.abiEncode(
    'addVersion(address)', ['address'], [t.context.version.address]
  );
  await t.context.governance.instance.propose.postTransaction(opts, [t.context.governance.address, calldata, 0]);
  const proposalId = await t.context.governance.instance.actionCount.call();
  await t.context.governance.instance.confirm.postTransaction(opts, [proposalId]);
  await t.context.governance.instance.trigger.postTransaction(opts, [proposalId]);
}
test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.governance = await deployContract("system/Governance", opts, [[deployer], 1, 100000]);
  t.context.version = await deployContract("version/Version", Object.assign(opts, {gas: 6800000}),
    [
      "1.0.0", t.context.governance.address, deployed.EthToken.address, deployed.MlnToken.address,
      deployed.CanonicalPriceFeed.address, deployer
    ],
    () => {}, true
  );
});

test('Triggering a Version activates it within Governance', async t => {
  const versionsBeforeTrigger = await t.context.governance.instance.getVersionsLength.call();
  await activateVersion(t);
  const versionsAfterTrigger = await t.context.governance.instance.getVersionsLength.call();
  const [ , activeAfterTriggering, ] = await t.context.governance.instance.getVersionById.call({}, [0]);

  t.is(Number(versionsBeforeTrigger), 0);
  t.is(Number(versionsAfterTrigger), 1);
  t.true(activeAfterTriggering);
});

test('Governance can shut down Version', async t => {
  await activateVersion(t);
  const [ , activeBeforeShutdown, ] = await t.context.governance.instance.getVersionById.call({}, [0]);

  const calldata = await api.util.abiEncode('shutDownVersion(uint)', ['uint'], [0]);
  await t.context.governance.instance.propose.postTransaction(opts, [t.context.governance.address, calldata, 0]);
  const proposalId = await t.context.governance.instance.actionCount.call();
  await t.context.governance.instance.confirm.postTransaction(opts, [proposalId]);
  await t.context.governance.instance.trigger.postTransaction(opts, [proposalId]);

  const versionShutDown = await t.context.version.instance.isShutDown.call({}, []);
  const [ , activeAfterShutdown, ] = await t.context.governance.instance.getVersionById.call({}, [0]);

  t.true(versionShutDown);
  t.true(activeBeforeShutdown);
  t.false(activeAfterShutdown);
});
