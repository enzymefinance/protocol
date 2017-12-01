pragma solidity ^0.4.17;

import '../dependencies/ERC20Interface.sol';

/// @title Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Asset Contract
/// @notice This extends the ERC20 Interface
contract AssetInterface is ERC20Interface {

    // CONSTANT METHODS

    function name() constant returns (string) {}
    function symbol() constant returns (string) {}
    function decimals() constant returns (uint) {}
}
