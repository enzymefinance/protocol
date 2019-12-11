pragma solidity ^0.5.13;

/// @notice Gives metrics about a Fund
interface AccountingInterface {

    event AssetAddition(
        address indexed asset
    );

    event AssetRemoval(
        address indexed asset
    );

    function getOwnedAssetsLength() external view returns (uint);
    function getFundHoldings() external returns (uint[], address[]);
    function calcAssetGAV(address ofAsset) external returns (uint);
    function calcGav() public returns (uint gav);
    function calcNav(uint gav, uint unclaimedFees) pure returns (uint);
    function valuePerShare(uint totalValue, uint numShares) public view returns (uint);
    function performCalculations() public returns (
        uint gav,
        uint unclaimedFees,
        uint feesInShares,
        uint nav,
        uint sharePrice,
        uint gavPerShareNetManagementFee
    );
    function calcSharePrice() external returns (uint);
    function calcGavPerShareNetManagementFee() public returns (uint);
}

interface AccountingFactoryInterface {
    function createInstance(address _hub, address _denominationAsset, address _nativeAsset, address[] _defaultAssets) external returns (address);
}
