import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setQtyStepFunction = transactionFactory(
  'setQtyStepFunction',
  Contracts.ConversionRates,
);

export { setQtyStepFunction };
