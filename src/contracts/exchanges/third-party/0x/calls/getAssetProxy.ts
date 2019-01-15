import { Address } from '@melonproject/token-math';
import { AssetProxyId } from '@0x/types';
import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';

interface GetAssetProxyArgs {
  assetProxyId?: AssetProxyId;
}

const prepareArgs = (
  _,
  { assetProxyId = AssetProxyId.ERC20 }: GetAssetProxyArgs,
) => [assetProxyId.toString()];

const postProcess = (_, result) => new Address(result);

const getAssetProxy = callFactory('getAssetProxy', Contracts.ZeroExExchange, {
  postProcess,
  prepareArgs,
});

export { getAssetProxy };
