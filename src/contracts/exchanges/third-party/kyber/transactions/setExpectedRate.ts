import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setExpectedRate = transactionFactory(
  'setExpectedRate',
  Contracts.KyberNetwork,
);

export { setExpectedRate };
