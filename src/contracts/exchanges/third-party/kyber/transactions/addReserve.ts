import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const addReserve = transactionFactory('addReserve', Contracts.KyberNetwork);

export { addReserve };
