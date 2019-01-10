import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { PostProcessCallFunction } from '../../../../utils/solidity/callFactory';
import * as web3Utils from 'web3-utils';

const postProcess: PostProcessCallFunction = (environment, result) => {
  return web3Utils.hexToAscii(result);
};

const getName = callFactoryWithoutParams('name', Contracts.Hub, {
  postProcess,
});

export { getName };
