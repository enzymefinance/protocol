import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setKyberProxy = transactionFactory(
  'setKyberProxy',
  Contracts.KyberNetwork,
);

export { setKyberProxy };
