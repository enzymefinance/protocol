// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IChai Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for our interactions with the Chai contract
interface IChai is IERC20 {
    function exit(address, uint256) external;

    function join(address, uint256) external;
}
