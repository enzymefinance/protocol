import { assetDataUtils } from '0x.js';
import { TokenInterface } from '@melonproject/token-math/token';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = async ({ zrxToken }: { zrxToken: TokenInterface }) => {
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(
    zrxToken.address.toString(),
  );

  return [zrxAssetData];
};

const changeZRXAsset = transactionFactory(
  'changeZRXAssetData',
  Contracts.EthfinexExchangeEfx,
  undefined,
  prepareArgs,
);

export { changeZRXAsset };
