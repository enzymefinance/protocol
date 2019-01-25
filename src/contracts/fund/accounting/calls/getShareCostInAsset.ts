import { createQuantity, createPrice } from '@melonproject/token-math';

import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';

const prepareArgs = (_, { assetToken, fundToken }) => {
  const shareQuantity = createQuantity(fundToken, 1);
  return [shareQuantity.quantity.toString(), assetToken.address];
};

const postProcess = async (environment, result, prepared) => {
  return createPrice(
    createQuantity(prepared.params.fundToken, 1),
    createQuantity(prepared.params.assetToken, result),
  );
};

const getShareCostInAsset = callFactory(
  'getShareCostInAsset',
  Contracts.Accounting,
  { prepareArgs, postProcess },
);

export { getShareCostInAsset };
