import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setSgdToEthRate = transactionFactory(
  'setSgdToEthRate',
  Contracts.KyberWhiteList,
);

export { setSgdToEthRate };
