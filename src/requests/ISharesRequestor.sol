pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

interface ISharesRequestor {
    struct Request {
        address investmentAsset;
        uint256 maxInvestmentAmount;
        uint256 shares;
        uint256 timestamp;
        uint256 incentiveFee;
    }

    // STORAGE
    function ownerToRequestByFund(
        address _requestOwner,
        address _hub
    ) external view returns (Request memory);

    // FUNCTIONS
    function cancelRequest(address _hub) external;
    function cancelRequestFor(address _requestOwner, address _hub) external;
    function executeRequestFor(address _requestOwner, address _hub) external payable;
    function getFundsRequestedSet(address _requestOwner) external view returns (address[] memory);
    function requestExists(address _requestOwner, address _hub) external view returns (bool);
    function requestHasExpired(address _requestOwner, address _hub) external view returns (bool);
    function requestIsExecutable(
        address _requestOwner,
        address _hub
    ) external view returns (bool, string memory);
    function requestShares(
        address _hub,
        address _investmentAsset,
        uint256 _maxInvestmentAmount,
        uint256 _sharesQuantity
    ) external payable;
}
