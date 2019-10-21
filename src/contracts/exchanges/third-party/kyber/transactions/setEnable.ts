import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const setEnable = transactionFactory('setEnable', Contracts.KyberNetwork);

export { setEnable };
