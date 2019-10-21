import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const addOperator = transactionFactory(
  'addOperator',
  Contracts.ConversionRates,
);

export { addOperator };
