import { assetDataUtils } from '@0x/order-utils';
import { TokenInterface } from '@melonproject/token-math';
import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export interface changeZRXAssetArgs {
  zrxToken: TokenInterface;
}

const prepareArgs: PrepareArgsFunction<changeZRXAssetArgs> = async (
  _,
  { zrxToken },
) => {
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(
    zrxToken.address.toString(),
  );

  return [zrxAssetData];
};

const changeZRXAsset = transactionFactory(
  'changeZRXAssetData',
  Contracts.ZeroExExchange,
  undefined,
  prepareArgs,
);

export { changeZRXAsset };
