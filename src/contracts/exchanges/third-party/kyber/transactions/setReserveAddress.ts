import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setReserveAddress = transactionFactory(
  'setReserveAddress',
  Contracts.ConversionRates,
);

export { setReserveAddress };
