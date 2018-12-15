pragma solidity ^0.4.21;

/// @notice Gives metrics about a Fund
interface AccountingInterface {

    event AssetAddition(
        address indexed asset
    );

    event AssetRemoval(
        address indexed asset
    );

    function getOwnedAssetsLength() view returns (uint);
    function getFundHoldings() returns (uint[], address[]);
    function calcAssetGAV(address ofAsset) returns (uint);
    function calcGav() returns (uint gav);
    function calcNav(uint gav, uint unclaimedFees) pure returns (uint);
    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint);
    function performCalculations() returns (
        uint gav,
        uint unclaimedFees,
        uint feesInShares,
        uint nav,
        uint sharePrice
    );
    function calcSharePriceAndAllocateFees() public returns (uint);
    function calcSharePrice() returns (uint);
}
