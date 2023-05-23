export * from './constants';
export * from './contracts';
export * from './utils';

export enum ChainlinkRateAsset {
  ETH = '0',
  USD = '1',
}

export enum VaultAction {
  None = '0',
  // Shares management
  BurnShares = '1',
  MintShares = '2',
  TransferShares = '3',
  // Asset management
  AddTrackedAsset = '4',
  ApproveAssetSpender = '5',
  RemoveTrackedAsset = '6',
  WithdrawAssetTo = '7',
  // External position management
  AddExternalPosition = '8',
  CallOnExternalPosition = '9',
  RemoveExternalPosition = '10',
}
