import { ensure } from '~/utils/guards/ensure';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { isOasisDexTakePermitted } from '../calls/isOasisDexTakePermitted';
import { Environment } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math/address';

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
