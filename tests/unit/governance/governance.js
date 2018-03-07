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

async function activateVersion() {
  const calldata = await api.util.abiEncode(
    'addVersion(address)', ['address'], [version.address]
  );
  await governance.instance.propose.postTransaction(opts, [governance.address, calldata, 0]);
  const proposalId = await governance.instance.actionCount.call();
  await governance.instance.confirm.postTransaction(opts, [proposalId]);
  await governance.instance.trigger.postTransaction(opts, [proposalId]);
}
test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async () => {
  governance = await deployContract("system/Governance", opts, [[deployer], 1, 100000]);
  version = await deployContract("version/Version", Object.assign(opts, {gas: 6800000}), [1, governance.address, deployed.EthToken.address], () => {}, true);
});

test('Triggering a Version activates it within Governance', async t => {

  const [ , activeBeforeTriggering, ] = await governance.instance.getVersionById.call({}, [0]);
  await activateVersion();
  const [ , activeAfterTriggering, ] = await governance.instance.getVersionById.call({}, [0]);

  t.false(activeBeforeTriggering);
  t.true(activeAfterTriggering);
});

test('Governance can shut down Version', async t => {
  await activateVersion();
  const [ , activeBeforeShutdown, ] = await governance.instance.getVersionById.call({}, [0]);

  const calldata = await api.util.abiEncode(
    'shutDownVersion(uint)', ['uint'], [0]
  );
  await governance.instance.propose.postTransaction(opts, [governance.address, calldata, 0]);
  const proposalId = await governance.instance.actionCount.call();
  await governance.instance.confirm.postTransaction(opts, [proposalId]);
  await governance.instance.trigger.postTransaction(opts, [proposalId]);

  const versionShutDown = await version.instance.isShutDown.call({}, []);
  const [ , activeAfterShutdown, ] = await governance.instance.getVersionById.call({}, [0]);

  t.true(versionShutDown);
  t.true(activeBeforeShutdown);
  t.false(activeAfterShutdown);
});
