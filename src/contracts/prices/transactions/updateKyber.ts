import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const updateKyber = transactionFactory('update', Contracts.KyberPriceFeed);

export { updateKyber };
