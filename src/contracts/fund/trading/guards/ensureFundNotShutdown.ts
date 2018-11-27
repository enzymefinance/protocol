import { ensure } from '~/utils/guards/ensure';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';

const ensureFundNotShutdown = async (
  tradingContractAddress,
  fund,
  environment = getGlobalEnvironment(),
) => {
  const isShutDown = true; // TODO
  ensure(!isShutDown, `The fund ${fund} is shut down.`);
};

export { ensureFundNotShutdown };
