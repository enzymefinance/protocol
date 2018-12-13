import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { PostProcessCallFunction } from '../../../../utils/solidity/callFactory';

const postProcess: PostProcessCallFunction = (environment, result) => {
  return new Date(result.toString() * 1000);
};

const getCreationTime = callFactoryWithoutParams(
  'creationTime',
  Contracts.Hub,
  {
    postProcess,
  },
);

export { getCreationTime };
