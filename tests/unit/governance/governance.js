import test from 'ava';
import web3 from "../../../utils/lib/web3";
import {deployContract} from "../../../utils/lib/contracts";
import {newMockAddress} from "../../../utils/lib/mocks";

let deployer;

async function activateVersion(context) {
  const calldata = await context.governance.methods.addVersion(context.version.options.address).encodeABI();
  await context.governance.methods.propose(context.governance.options.address, calldata, 0).send({from: deployer});
  const proposalId = await context.governance.methods.actionCount().call();
  await context.governance.methods.confirm(proposalId).send({from: deployer});
  await context.governance.methods.trigger(proposalId).send({from: deployer});
}
test.before(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer] = accounts;
});

test.beforeEach(async t => {
  t.context.governance = await deployContract(
    "system/Governance",
    {from: deployer, gas: 6800000},
    [ [deployer], 1, 100000 ]
  );
  t.context.version = await deployContract(
    "version/Version",
    {from: deployer, gas: 6800000},
    [
      "V1", t.context.governance.options.address, newMockAddress(), newMockAddress(),
      newMockAddress(), deployer
    ], () => {}, true
  );
});

test('Triggering a Version activates it within Governance', async t => {
  const versionsBeforeTrigger = await t.context.governance.methods.getVersionsLength().call();
  await activateVersion(t.context);
  const versionsAfterTrigger = await t.context.governance.methods.getVersionsLength().call();
  const [ , activeAfterTriggering, ] = Object.values(await t.context.governance.methods.getVersionById(0).call());

  t.is(Number(versionsBeforeTrigger), 0);
  t.is(Number(versionsAfterTrigger), 1);
  t.true(activeAfterTriggering);
});

test('Governance can shut down Version', async t => {
  await activateVersion(t.context);
  const activeBeforeShutdown = await t.context.governance.methods.isActive(0).call();

  const calldata = await t.context.governance.methods.shutDownVersion(0).encodeABI();
  await t.context.governance.methods.propose(t.context.governance.options.address, calldata, 0).send({from: deployer});
  const proposalId = await t.context.governance.methods.actionCount().call();
  await t.context.governance.methods.confirm(proposalId).send({from: deployer});
  await t.context.governance.methods.trigger(proposalId).send({from: deployer});

  const versionShutDown = await t.context.version.methods.isShutDown().call();
  const activeAfterShutdown = await t.context.governance.methods.isActive(0).call();
  t.true(versionShutDown);
  t.true(activeBeforeShutdown);
  t.false(activeAfterShutdown);
});
