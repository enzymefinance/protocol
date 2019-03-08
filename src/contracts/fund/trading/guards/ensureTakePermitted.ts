import { QuantityInterface, Address } from '@melonproject/token-math';

import { ensure } from '~/utils/guards/ensure';
import { isTakePermitted } from '../calls/isTakePermitted';
import { Environment } from '~/utils/environment/Environment';
import { Exchanges } from '~/Contracts';

const ensureTakePermitted = async (
  environment: Environment,
  tradingContractAddress: Address,
  exchangeName: Exchanges,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  fillTakerQuantity: QuantityInterface,
  id?: number,
) => {
  const isAllowed = await isTakePermitted(
    environment,
    tradingContractAddress,
    exchangeName,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
    id,
  );

  ensure(isAllowed, "Risk Management module doesn't allow this trade.");
};

export { ensureTakePermitted };
