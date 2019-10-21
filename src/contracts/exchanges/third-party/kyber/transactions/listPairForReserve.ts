import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const listPairForReserve = transactionFactory(
  'listPairForReserve',
  Contracts.KyberNetwork,
);

export { listPairForReserve };
