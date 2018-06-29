import test from 'ava';
import web3 from "../../../utils/lib/web3";
import {deployContract} from "../../../utils/lib/contracts";
import deployEnvironment from "../../../utils/deploy/contracts";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

let accounts;
let deployer;
let opts;
let deployed;

async function activateVersion(context) {
  const calldata = await context.governance.methods.addVersion(context.version.options.address).encodeABI();
  await context.governance.methods.propose(context.governance.options.address, calldata, 0).send(opts);
  const proposalId = await context.governance.methods.actionCount().call();
  await context.governance.methods.confirm(proposalId).send();
  await context.governance.methods.trigger(proposalId).send();
}
test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.governance = await deployContract("system/Governance", opts, [[deployer], 1, 100000]);
  t.context.version = await deployContract("version/Version", Object.assign(opts, {gas: 6800000}), ["V1", t.context.governance.options.address, deployed.EthToken.options.address, deployed.MlnToken.options.address, deployed.CanonicalPriceFeed.options.address, deployer], () => {}, true);
});

test('Triggering a Version activates it within Governance', async t => {
  const versionsBeforeTrigger = await t.context.governance.instance.getVersionsLength.call();
  await activateVersion(t);
  const versionsAfterTrigger = await t.context.governance.instance.getVersionsLength.call();
  const [ , activeAfterTriggering, ] = await t.context.governance.instance.getVersionById.call({}, [0]);

  // const { 1: activeBeforeTriggering } = await governance.methods.getVersionById(0).call();
  await activateVersion(t.context);
  const { 1: activeAfterTriggering } = await t.context.governance.methods.getVersionById(0).call();

  // t.false(activeBeforeTriggering);
  t.true(activeAfterTriggering);
});

test('Governance can shut down Version', async t => {
  await activateVersion(t.context);
  const activeBeforeShutdown = await t.context.governance.methods.isActive(0).call();

  const calldata = await t.context.governance.methods.shutDownVersion(0).encodeABI();
  await t.context.governance.methods.propose(t.context.governance.options.address, calldata, 0).send(opts);
  const proposalId = await t.context.governance.methods.actionCount().call();
  await t.context.governance.methods.confirm(proposalId).send();
  await t.context.governance.methods.trigger(proposalId).send();

  const versionShutDown = await t.context.version.methods.isShutDown().call();
  const activeAfterShutdown = await t.context.governance.methods.isActive(0).call();
  // t.true(versionShutDown);
  t.true(activeBeforeShutdown);
  t.false(activeAfterShutdown);
});
