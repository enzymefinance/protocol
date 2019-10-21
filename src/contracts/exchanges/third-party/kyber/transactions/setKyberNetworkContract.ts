import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setKyberNetworkContract = transactionFactory(
  'setKyberNetworkContract',
  Contracts.KyberNetworkProxy,
);

export { setKyberNetworkContract };
