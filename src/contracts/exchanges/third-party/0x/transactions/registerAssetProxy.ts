import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const registerAssetProxy = transactionFactory(
  'registerAssetProxy',
  Contracts.ZeroExExchange,
);

export { registerAssetProxy };
