pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/IHub.sol";

interface IShares {
    // FUNCTIONS
    function getSharesInvestmentAssets() external view returns (address[] memory);
    function isSharesInvestmentAsset(address _asset) external view returns (bool);
    function redeemShares() external;
    function redeemSharesQuantity(uint256 _shareQuantity) external;
    function redeemSharesWithConstraints(
        uint256 _shareQuantity,
        address[] calldata _requestedAssets
    ) external;

    // Caller: SharesRequestor only
    function buyShares(
        address _buyer,
        address _investmentAsset,
        uint256 _sharesQuantity
    ) external returns (uint256);

    // Caller: Auth only
    function disableSharesInvestmentAssets(address[] calldata _assets) external;
    function enableSharesInvestmentAssets(address[] calldata _assets) external;

    // INHERITED: SharesToken
    // FUNCTIONS
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);

    // Caller: Auth only
    function createFor(address _who, uint _amount) external;
    function destroyFor(address _who, uint _amount) external;

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

interface ISharesFactory {
    function createInstance(address _hub, address[] calldata _defaultAssets, address _registry) external returns (address);
}
