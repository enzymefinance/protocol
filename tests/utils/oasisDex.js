import { ENCODING_TYPES } from '~/tests/utils/constants';
import { encodeArgs } from '~/tests/utils/formatting';

export const encodeOasisDexTakeOrderArgs = ({
  makerAsset,
  makerQuantity,
  takerAsset,
  takerQuantity,
  orderId,
}) => {
  const orderAddresses = [];
  const orderValues = [];

  orderAddresses[0] = makerAsset;
  orderAddresses[1] = takerAsset;
  orderValues[0] = makerQuantity;
  orderValues[1] = takerQuantity;

  const args = [orderAddresses, orderValues, orderId];
  return encodeArgs(ENCODING_TYPES.OASIS_DEX, args);
};
