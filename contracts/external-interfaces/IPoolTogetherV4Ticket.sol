// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPoolTogetherV4Ticket Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for interactions with PoolTogether tokens (ptTokens)
interface IPoolTogetherV4Ticket is IERC20 {
    function controller() external view returns (address);
}
