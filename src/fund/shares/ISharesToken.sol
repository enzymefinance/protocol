pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/IHub.sol";

interface IShares {
    // STORAGE
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
    function decimals() external view returns (uint8);

    // FUNCTIONS

    // Caller: Auth only
    function createFor(address _who, uint _amount) external;
    function destroyFor(address _who, uint _amount) external;

    // INHERITED: StandardToken
    // FUNCTIONS
    function balanceOf(address _owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);

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
}
