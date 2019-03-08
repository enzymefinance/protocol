import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const cancelRequest = transactionFactory(
  'cancelRequest',
  Contracts.Participation,
  undefined,
  undefined,
  undefined,
  { amguPayable: true },
);

export { cancelRequest };
