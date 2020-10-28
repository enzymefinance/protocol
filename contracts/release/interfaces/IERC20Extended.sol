// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IERC20Extended Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IERC20Extended is IERC20 {
    function decimals() external view returns (uint256);

    function burn(uint256) external;
}
