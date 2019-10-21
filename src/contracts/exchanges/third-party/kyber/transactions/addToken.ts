import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const addToken = transactionFactory('addToken', Contracts.ConversionRates);

export { addToken };
