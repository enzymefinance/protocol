import { QuantityInterface, Address } from '@melonproject/token-math';

import { ensure } from '~/utils/guards/ensure';
import { isOasisDexTakePermitted } from '../calls/isOasisDexTakePermitted';
import { Environment } from '~/utils/environment/Environment';

const ensureTakePermitted = async (
  environment: Environment,
  tradingContractAddress: Address,
  id: number,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  fillTakerTokenAmount: QuantityInterface,
) => {
  const isAllowed = await isOasisDexTakePermitted(
    environment,
    tradingContractAddress,
    id,
    makerQuantity,
    takerQuantity,
    fillTakerTokenAmount,
  );

  ensure(isAllowed, "Risk Management module doesn't allow this trade.");
};

export { ensureTakePermitted };
