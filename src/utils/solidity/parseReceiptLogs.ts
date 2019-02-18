import * as R from 'ramda';
import web3EthAbi from 'web3-eth-abi';

import { eventSignatureABIMap } from '~/Contracts';

const parseReceiptLogs = (receipt, log) => {
  const events = receipt.logs.reduce((carry, txLog) => {
    const eventABI = eventSignatureABIMap[txLog.topics[0]];

    // Ignore event if not found in eventSignaturesABI map;
    if (!eventABI) {
      log.debug('No Event-ABI found for', txLog);
      return carry;
    }

    try {
      const decoded = web3EthAbi.decodeLog(
        eventABI.inputs,
        txLog.data !== '0x' && txLog.data,
        eventABI.anonymous ? txLog.topics : txLog.topics.slice(1),
      );
      const keys = R.map(R.prop('name'), eventABI.inputs);
      const picked = R.pick(keys, decoded);

      const current = R.cond([
        [
          Array.isArray,
          existingEventLog => [...existingEventLog, { returnValues: picked }],
        ],
        [R.isNil, R.always({ returnValues: picked })],
        [R.T, existingEventLog => [existingEventLog, { returnValues: picked }]],
      ])(carry[eventABI.name]);

      return {
        ...carry,
        [eventABI.name]: current,
      };
    } catch (e) {
      log.warn('Error with parsing logs', eventABI, txLog, e);
      return carry;
    }
  }, {});

  return {
    ...receipt,
    events,
  };
};

export { parseReceiptLogs };
