import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const deposit = transactionFactory('deposit', Contracts.Weth);

export { deposit };
