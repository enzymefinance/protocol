import { assetDataUtils } from '@0x/order-utils';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { callFactory } from '~/utils/solidity/callFactory';

const postProcess = async (environment, result) => {
  const { tokenAddress } = assetDataUtils.decodeERC20AssetData(result);

  const token = await getToken(environment, tokenAddress);
  return token;
};

const getFeeToken = callFactory('ZRX_ASSET_DATA', Contracts.ZeroExExchange, {
  postProcess,
});

export { getFeeToken };
