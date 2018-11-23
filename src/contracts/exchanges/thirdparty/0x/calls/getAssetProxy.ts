import { Address } from '@melonproject/token-math/address';
import { AssetProxyId } from '0x.js';
import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

interface GetAssetProxyArgs {
  assetProxyId?: AssetProxyId;
}

const prepareArgs = ({
  assetProxyId = AssetProxyId.ERC20,
}: GetAssetProxyArgs) => [assetProxyId.toString()];

const postProcess = result => new Address(result);

const getAssetProxy = callFactory('getAssetProxy', Contracts.ZeroExExchange, {
  postProcess,
  prepareArgs,
});

export { getAssetProxy };
