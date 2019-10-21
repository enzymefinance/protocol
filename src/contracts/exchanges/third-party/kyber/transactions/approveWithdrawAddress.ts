import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const approveWithdrawAddress = transactionFactory(
  'approveWithdrawAddress',
  Contracts.KyberReserve,
);

export { approveWithdrawAddress };
