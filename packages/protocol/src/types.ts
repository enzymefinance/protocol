export enum ReleaseStatusTypes {
  PreLaunch,
  Live,
  Paused,
}

export enum ChainlinkRateAsset {
  ETH,
  USD,
}

export enum VaultAction {
  None,
  // Shares management
  BurnShares,
  MintShares,
  TransferShares,
  // Asset management
  AddPersistentlyTrackedAsset,
  AddTrackedAsset,
  ApproveAssetSpender,
  RemovePersistentlyTrackedAsset,
  RemoveTrackedAsset,
  WithdrawAssetTo,
  // External position management
  AddExternalPosition,
  CallOnExternalPosition,
  RemoveExternalPosition,
}
