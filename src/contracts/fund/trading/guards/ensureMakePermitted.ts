import { ensure } from '~/utils/guards';
import { isOasisDexMakePermitted } from '~/contracts/fund/trading/calls/isOasisDexMakePermitted';
import { QuantityInterface } from '@melonproject/token-math/quantity';

const ensureMakePermitted = async (
  tradingContractAddress,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  environment,
) => {
  const isAllowed = await isOasisDexMakePermitted(
    tradingContractAddress,
    makerQuantity,
    takerQuantity,
    environment,
  );

  ensure(isAllowed, "Risk Management module doesn't allow this trade.");
};

export { ensureMakePermitted };
