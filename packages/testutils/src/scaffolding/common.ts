import { AddressLike } from '@enzymefinance/ethers';
import { StandardToken } from '@enzymefinance/protocol';
import { utils } from 'ethers';

export async function getAssetBalances({ account, assets }: { account: AddressLike; assets: AddressLike[] }) {
  return Promise.all(assets.map((asset) => new StandardToken(asset, provider).balanceOf(account)));
}

export async function getAssetUnit(asset: StandardToken) {
  return utils.parseUnits('1', await asset.decimals());
}
