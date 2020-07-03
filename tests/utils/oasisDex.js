import { ENCODING_TYPES } from '~/utils/constants';
import { encodeArgs } from '~/utils/formatting';

export const encodeOasisDexTakeOrderArgs = ({
  makerAsset,
  makerQuantity,
  takerAsset,
  takerQuantity,
  orderId,
}) => {
  const args = [makerAsset, makerQuantity, takerAsset, takerQuantity, orderId];
  return encodeArgs(ENCODING_TYPES.OASIS_DEX, args);
};
