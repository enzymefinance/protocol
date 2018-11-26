import { ensure } from '~/utils/guards';
import { getGlobalEnvironment } from '~/utils/environment';

const ensureFundNotShutdown = async (
  tradingContractAddress,
  fund,
  environment = getGlobalEnvironment(),
) => {
  const isShutDown = true; // TODO
  ensure(!isShutDown, `The fund ${fund} is shut down.`);
};

export { ensureFundNotShutdown };
