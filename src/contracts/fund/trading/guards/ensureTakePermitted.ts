import { ensure } from '~/utils/guards';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { isOasisDexTakePermitted } from '../calls/isOasisDexTakePermitted';

const ensureTakePermitted = async (
  tradingContractAddress,
  id: number,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  fillTakerTokenAmount: QuantityInterface,
  environment,
) => {
  const isAllowed = await isOasisDexTakePermitted(
    tradingContractAddress,
    id,
    makerQuantity,
    takerQuantity,
    fillTakerTokenAmount,
    environment,
  );

  ensure(isAllowed, "Risk Management module doesn't allow this trade.");
};

export { ensureTakePermitted };
