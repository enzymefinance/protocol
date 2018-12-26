import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const addAuthorizedAddress = transactionFactory(
  'addAuthorizedAddress',
  Contracts.ERC20Proxy,
);

export { addAuthorizedAddress };
