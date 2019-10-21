import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const enableTokenTrade = transactionFactory(
  'enableTokenTrade',
  Contracts.ConversionRates,
);

export { enableTokenTrade };
