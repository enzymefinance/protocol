import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setWhiteList = transactionFactory('setWhiteList', Contracts.KyberNetwork);

export { setWhiteList };
