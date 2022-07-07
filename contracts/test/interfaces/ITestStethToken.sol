// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ITestStethToken Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for the StetToken
interface ITestStethToken is IERC20 {
    function decimals() external view returns (uint8 decimals_);

    function getPooledEthByShares(uint256 _sharesAmount)
        external
        view
        returns (uint256 ethByShares_);
}
