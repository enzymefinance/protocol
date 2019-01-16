import { ensure } from '~/utils/guards/ensure';
import { isKyberTakePermitted } from '../calls/isKyberTakePermitted';
import { Environment } from '~/utils/environment/Environment';
import { Address, QuantityInterface } from '@melonproject/token-math';

const ensureKyberTakePermitted = async (
  environment: Environment,
  tradingContractAddress: Address,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  fillTakerQuantity: QuantityInterface,
) => {
  const isAllowed = await isKyberTakePermitted(
    environment,
    tradingContractAddress,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
  );

  ensure(isAllowed, "Risk Management module doesn't allow this trade.");
};

export { ensureKyberTakePermitted };
