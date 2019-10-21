import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setImbalanceStepFunction = transactionFactory(
  'setImbalanceStepFunction',
  Contracts.ConversionRates,
);

export { setImbalanceStepFunction };
