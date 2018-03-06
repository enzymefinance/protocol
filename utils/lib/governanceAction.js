import api from './api';

/**
 * Send a transaction from Governance, using propose, confirm and trigger.
 * Only works if quorum of Governance is 1.
 * @param {Object} opts - Options object passed to parity.js transactions
 * @param {Object} governance - Parity.js contract object for Governance
 * @param {Object} target - Parity.js contract object for Target contract
 * @param {string} methodName - Name of the method to be callej
 * @param {[*]} methodArgs - Arguments to be passed to the called method
 * @param {number} value - Amount of Ether to send to target contract
 */
async function governanceAction(opts, governance, target, methodName, methodArgs = [], value = 0) {
  const calldata = await api.util.encodeMethodCallAbi(
    target.instance[methodName]._abi,
    methodArgs
  );
  let txid;
  txid = await governance.instance.propose.postTransaction(opts, [target.address, calldata, value]);
  await governance._pollTransactionReceipt(txid);
  const proposalId = await governance.instance.actionCount.call();
  txid = await governance.instance.confirm.postTransaction(opts, [proposalId]);
  await governance._pollTransactionReceipt(txid);
  txid = await governance.instance.trigger.postTransaction(opts, [proposalId]);
  await governance._pollTransactionReceipt(txid);
}

export default governanceAction;
