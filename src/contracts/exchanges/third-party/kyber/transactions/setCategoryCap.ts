import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setCategoryCap = transactionFactory(
  'setCategoryCap',
  Contracts.KyberWhiteList,
);

export { setCategoryCap };
