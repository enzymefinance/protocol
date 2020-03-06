pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/IHub.sol";

interface IAccounting {
    // STORAGE
    function assetBalances(address) external view returns (uint256);
    function DEFAULT_SHARE_PRICE() external view returns (uint256);
    function DENOMINATION_ASSET() external view returns (address);
    function MAX_OWNED_ASSETS() external view returns (uint8);
    function ownedAssets(uint256 _index) external view returns (address);
    function SHARES_DECIMALS() external view returns (uint8);

    // FUNCTIONS
    function calcAssetGav(address _asset) external view returns (uint256);
    function calcFundMetrics() external returns (
        uint256 gav_,
        uint256 unclaimedFees_,
        uint256 feesInShares_,
        uint256 nav_,
        uint256 sharePrice_,
        uint256 gavPerShareNetManagementFee_
    );
    function calcGav() external view returns (uint256);
    function calcNav(uint256 _gav, uint256 _unclaimedFees) external pure returns (uint256);
    function getAllAssetBalances()
        external
        view
        returns(address[] memory assets_, uint256[] memory balances_);
    function getAssetBalances(address[] calldata _assets) external view returns(uint256[] memory);
    function getFundHoldingsForAsset(address _asset) external view returns (uint256);
    function getFundHoldings() external returns (address[] memory assets_, uint256[] memory balances_);
    function getOwnedAssetsLength() external view returns (uint256);
    function getShareCostInAsset(uint256 _numShares, address _altAsset) external returns (uint256);
    function triggerRewardAllFees() external payable;
    function valuePerShare(uint256 _totalValue, uint256 _numShares)
        external
        view
        returns (uint256);

    // Caller: Auth only
    function decreaseAssetBalance(address _asset, uint256 _amount) external;
    function increaseAssetBalance(address _asset, uint256 _amount) external;

    // INHERITED: ISpoke
    // STORAGE
    function hub() external view returns (IHub);
    function initialized() external view returns (bool);
    function routes() external view returns (IHub.Routes memory);

    // FUNCTIONS
    function engine() external view returns (address);
    function mlnToken() external view returns (address);
    function priceSource() external view returns (address);
    function fundFactory() external view returns (address);
    function registry() external view returns (address);
}

interface IAccountingFactory {
    function createInstance(address _hub, address _denominationAsset, address _registry)
        external
        returns (address);
}
