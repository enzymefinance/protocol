import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setContracts = transactionFactory('setContracts', Contracts.KyberReserve);

export { setContracts };
