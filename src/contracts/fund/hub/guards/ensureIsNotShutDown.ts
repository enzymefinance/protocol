import { Address } from '@melonproject/token-math/address';
import { isShutDown } from '../calls/isShutDown';
import { ensure } from '~/utils/guards/ensure';
import { Environment } from '~/utils/environment/Environment';

const ensureIsNotShutDown = async (
  address: Address,
  environment: Environment,
) => {
  const shutDown = await isShutDown(address, null, environment);
  ensure(!shutDown, `Fund with hub address: ${address} is shut down`);
};

export { ensureIsNotShutDown };
