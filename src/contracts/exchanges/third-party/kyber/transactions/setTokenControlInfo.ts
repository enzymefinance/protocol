import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setTokenControlInfo = transactionFactory(
  'setTokenControlInfo',
  Contracts.ConversionRates,
);

export { setTokenControlInfo };
