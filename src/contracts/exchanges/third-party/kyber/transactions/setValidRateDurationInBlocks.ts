import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setValidRateDurationInBlocks = transactionFactory(
  'setValidRateDurationInBlocks',
  Contracts.ConversionRates,
);

export { setValidRateDurationInBlocks };
