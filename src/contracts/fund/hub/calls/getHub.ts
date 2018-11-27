import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getHub = callFactoryWithoutParams('hub', Contracts.Spoke);

export { getHub };
