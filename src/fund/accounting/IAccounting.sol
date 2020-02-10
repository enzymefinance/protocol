pragma solidity 0.6.1;

/// @notice Gives metrics about a Fund
interface IAccounting {
    function getOwnedAssetsLength() external view returns (uint);
    function getFundHoldings() external returns (uint[] memory, address[] memory);
    function calcAssetGAV(address ofAsset) external returns (uint);
    function calcGav() external returns (uint gav);
    function calcNav(uint gav, uint unclaimedFees) external pure returns (uint);
    function valuePerShare(uint totalValue, uint numShares) external view returns (uint);
    function performCalculations() external returns (
        uint gav,
        uint unclaimedFees,
        uint feesInShares,
        uint nav,
        uint sharePrice,
        uint gavPerShareNetManagementFee
    );
    function calcGavPerShareNetManagementFee() external returns (uint);
}

interface IAccountingFactory {
    function createInstance(address _hub, address _denominationAsset, address _nativeAsset) external returns (address);
}
