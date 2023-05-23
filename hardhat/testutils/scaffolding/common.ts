import type { AddressLike } from '@enzymefinance/ethers';
import { ITestStandardToken } from '@enzymefinance/protocol';
import { utils } from 'ethers';

export async function getAssetBalances({ account, assets }: { account: AddressLike; assets: AddressLike[] }) {
  return Promise.all(assets.map((asset) => new ITestStandardToken(asset, provider).balanceOf.args(account).call()));
}

export async function getAssetUnit(asset: ITestStandardToken) {
  return utils.parseUnits('1', await asset.decimals());
}
