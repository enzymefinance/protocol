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
let governance;
let version;
let deployed;

async function activateVersion() {
  const calldata = await governance.methods.addVersion(version.options.address).encodeABI();
  console.log(calldata);

  await governance.methods.propose(governance.options.address, calldata, 0).send(opts);
  const proposalId = await governance.methods.actionCount().call();
  await governance.methods.confirm(proposalId).send();
  await governance.methods.trigger(proposalId).send();
}
test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async () => {
  governance = await deployContract("system/Governance", opts, [[deployer], 1, 100000]);
  version = await deployContract("version/Version", Object.assign(opts, {gas: 6800000}), ["V1", governance.options.address, deployed.EthToken.options.address, deployed.MlnToken.options.address, deployed.CanonicalPriceFeed.options.address, deployer], () => {}, true);
});

test('Triggering a Version activates it within Governance', async t => {

  const [ , activeBeforeTriggering, ] = await governance.methods.getVersionById(0).call();
  await activateVersion();
  const [ , activeAfterTriggering, ] = await governance.methods.getVersionById(0).call();

  t.false(activeBeforeTriggering);
  t.true(activeAfterTriggering);
});

test('Governance can shut down Version', async t => {
  await activateVersion();
  const [ , activeBeforeShutdown, ] = await governance.methods.getVersionById(0).call();

  const calldata = await governance.methods.shutDownVersion(0).encodeABI();
  await governance.methods.propose(governance.address, calldata, 0).send(opts);
  const proposalId = await governance.methods.actionCount().call();
  await governance.methods.confirm(proposalId).send();
  await governance.methods.trigger(proposalId).send();

  const versionShutDown = await version.metbods.isShutDown().call();
  const [ , activeAfterShutdown, ] = await governance.methods.getVersionById(0).call();

  t.true(versionShutDown);
  t.true(activeBeforeShutdown);
  t.false(activeAfterShutdown);
});
