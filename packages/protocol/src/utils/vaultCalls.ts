import { utils } from 'ethers';

import { sighash } from './sighash';

export const pricelessAssetBypassStartAssetBypassTimelockSelector = sighash(
  utils.FunctionFragment.fromString('startAssetBypassTimelock(address)'),
);

export const vaultCallAnyDataHash = '0x5bf1898dd28c4d29f33c4c1bb9b8a7e2f6322847d70be63e8f89de024d08a669';
