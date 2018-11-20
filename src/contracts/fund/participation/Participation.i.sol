pragma solidity ^0.4.21;


/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface ParticipationInterface {
    // Specify the mapping
    // TODO: Is this a good pattern? My intention is to only load the interface ABIs in TypeScript
    // to have a clear separation of public API and internal API. Other possiblity would be to write
    // a getter function (getRequest), but this seems superflous to me.
    // function requests(address requestOwner) public returns (
    //     address investmentAsset,
    //     uint investmentAmount,
    //     uint requestedShares,
    //     uint timestamp,
    //     uint atUpdateId
    // );

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external payable;
    function hasRequest(address) view returns (bool);
    function cancelRequest() external;
    function executeRequest() external payable;
    function executeRequestFor(address requestOwner) external payable;
    function redeem() public;
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public;
}

