pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "./IHub.sol";

interface ISpoke {
    function getHub() external view returns (IHub);
    function getRoutes() external view returns (IHub.Routes memory);
    function initialized() external view returns (bool);
    function priceSource() external view returns (address);
}
