/**
 * Send a transaction from Governance, using propose, confirm and trigger.
 * Only works if quorum of Governance is 1.
 * @param {Object} opts - Options object passed to parity.js transactions
 * @param {Object} governance - Contract object for Governance
 * @param {Object} target - Contract object for Target contract
 * @param {string} methodName - Name of the method to be callej
 * @param {[*]} methodArgs - Arguments to be passed to the called method
 * @param {number} value - Amount of Ether to send to target contract
 */
async function governanceAction(opts, governance, target, methodName, methodArgs = [], value = 0) {
  const calldata = target.methods[methodName](...methodArgs).encodeABI();
  await governance.methods.propose(target.options.address, calldata, value).send(opts);
  const proposalId = await governance.methods.actionCount().call();
  await governance.methods.confirm(proposalId).send(opts);
  await governance.methods.trigger(proposalId).send(opts);
}

export default governanceAction;
