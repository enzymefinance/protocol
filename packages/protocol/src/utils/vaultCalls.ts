import { utils } from 'ethers';

import { sighash } from './sighash';

export const aaveClaimRewardsToSelfSelector = sighash(
  utils.FunctionFragment.fromString('claimRewardsToSelf(address[], uint256)'),
);

export const addressListRegistryAddToListSelector = sighash(
  utils.FunctionFragment.fromString('addToList(uint256,address[])'),
);

export const addressListRegistryAttestListsSelector = sighash(
  utils.FunctionFragment.fromString('attestLists(uint256[],string[])'),
);

export const addressListRegistryCreateListSelector = sighash(
  utils.FunctionFragment.fromString('createList(address,uint8,address[])'),
);

export const addressListRegistryRemoveFromListSelector = sighash(
  utils.FunctionFragment.fromString('removeFromList(uint256,address[])'),
);

export const addressListRegistrySetListOwnerSelector = sighash(
  utils.FunctionFragment.fromString('setListOwner(uint256,address)'),
);

export const addressListRegistrySetListUpdateTypeSelector = sighash(
  utils.FunctionFragment.fromString('setListUpdateType(uint256,uint8)'),
);

export const curveMinterMintSelector = sighash(utils.FunctionFragment.fromString('mint(address)'));

export const curveMinterMintManySelector = sighash(utils.FunctionFragment.fromString('mint_many(address[8])'));

export const curveMinterToggleApproveMintSelector = sighash(
  utils.FunctionFragment.fromString('toggle_approve_mint(address)'),
);

export const pricelessAssetBypassStartAssetBypassTimelockSelector = sighash(
  utils.FunctionFragment.fromString('startAssetBypassTimelock(address)'),
);

export const synthetixAssignExchangeDelegateSelector = sighash(
  utils.FunctionFragment.fromString('approveExchangeOnBehalf(address)'),
);

export const vaultCallAnyDataHash = '0x5bf1898dd28c4d29f33c4c1bb9b8a7e2f6322847d70be63e8f89de024d08a669';
