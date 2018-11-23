import { transactionFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const take0xOrder = transactionFactory('callOnExchange', Contracts.Trading);

export { take0xOrder };
