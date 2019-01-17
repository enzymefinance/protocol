import { Address } from '@melonproject/token-math';
import { isShutDown } from '../calls/isShutDown';
import { ensure } from '~/utils/guards/ensure';
import { Environment } from '~/utils/environment/Environment';

const ensureIsNotShutDown = async (
  environment: Environment,
  address: Address,
) => {
  const shutDown = await isShutDown(environment, address);
  ensure(!shutDown, `Fund with hub address: ${address} is shut down`);
};

export { ensureIsNotShutDown };
