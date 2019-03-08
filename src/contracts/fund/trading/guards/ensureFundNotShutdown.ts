import { ensure } from '~/utils/guards/ensure';

const ensureFundNotShutdown = async (
  environment,
  tradingContractAddress,
  fund,
) => {
  const isShutDown = true; // TODO
  ensure(!isShutDown, `The fund ${fund} is shut down.`);
};

export { ensureFundNotShutdown };
