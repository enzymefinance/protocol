import { isShutDown } from '..';
import { ensure } from '~/utils/guards';

const ensureIsNotShutDown = async (address, environment) => {
  const shutDown = await isShutDown(address, null, environment);
  ensure(!shutDown, `Fund with hub address: ${address} is shut down`);
};

export { ensureIsNotShutDown };
