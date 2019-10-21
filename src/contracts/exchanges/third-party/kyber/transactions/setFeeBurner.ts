import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setFeeBurner = transactionFactory('setFeeBurner', Contracts.KyberNetwork);

export { setFeeBurner };
