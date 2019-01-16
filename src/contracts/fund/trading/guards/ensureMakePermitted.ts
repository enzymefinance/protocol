import { QuantityInterface, Address } from '@melonproject/token-math';

import { ensure } from '~/utils/guards/ensure';
import { isOasisDexMakePermitted } from '~/contracts/fund/trading/calls/isOasisDexMakePermitted';
import { Environment } from '~/utils/environment/Environment';

const ensureMakePermitted = async (
  environment: Environment,
  tradingContractAddress: Address,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
) => {
  const isAllowed = await isOasisDexMakePermitted(
    environment,
    tradingContractAddress,
    makerQuantity,
    takerQuantity,
  );

  ensure(isAllowed, "Risk Management module doesn't allow this trade.");
};

export { ensureMakePermitted };
