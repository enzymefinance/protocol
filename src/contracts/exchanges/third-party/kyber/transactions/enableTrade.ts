import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const enableTrade = transactionFactory('enableTrade', Contracts.KyberReserve);

export { enableTrade };
