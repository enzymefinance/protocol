import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getRegistry = callFactoryWithoutParams('registry', Contracts.Engine);

export { getRegistry };
