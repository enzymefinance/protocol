export enum PolicyHook {
  PostBuyShares = '0',
  PostCallOnIntegration = '1',
  PreTransferShares = '2',
  RedeemSharesForSpecificAssets = '3',
  AddTrackedAssets = '4',
  RemoveTrackedAssets = '5',
  CreateExternalPosition = '6',
  PostCallOnExternalPosition = '7',
  RemoveExternalPosition = '8',
  ReactivateExternalPosition = '9',
}
