import { Address } from '@melonproject/token-math/address';
import { isShutDown } from '..';
import { ensure } from '~/utils/guards';
import { Environment } from '~/utils/environment';

const ensureIsNotShutDown = async (
  address: Address,
  environment: Environment,
) => {
  const shutDown = await isShutDown(address, null, environment);
  ensure(!shutDown, `Fund with hub address: ${address} is shut down`);
};

export { ensureIsNotShutDown };
