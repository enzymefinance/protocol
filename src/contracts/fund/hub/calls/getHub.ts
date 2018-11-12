import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getHub = callFactoryWithoutParams('hub', Contracts.Spoke);

export { getHub };
