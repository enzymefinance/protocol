import { assetDataUtils } from '0x.js';
import { getToken } from '~/contracts/dependencies/token';
import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const postProcess = async result => {
  const { tokenAddress } = assetDataUtils.decodeERC20AssetData(result);

  const token = await getToken(tokenAddress);
  return token;
};

const getFeeToken = callFactory('ZRX_ASSET_DATA', Contracts.ZeroExExchange, {
  postProcess,
});

export { getFeeToken };
