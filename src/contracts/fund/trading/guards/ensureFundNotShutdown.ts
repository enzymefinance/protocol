import { ensure } from '~/utils/guards';
import { getHub } from '~/contracts/fund/hub';
import { getGlobalEnvironment } from '~/utils/environment';
import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const ensureFundNotShutdown = async (
  tradingContractAddress,
  fund,
  environment = getGlobalEnvironment(),
) => {
  const isShutDown = true; // TODO
  ensure(!isShutDown, `The fund ${fund} is shut down.`);
};

export { ensureFundNotShutdown };
