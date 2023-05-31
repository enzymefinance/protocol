// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IDerivativePriceFeed Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Simple interface for derivative price source oracle implementations
interface IDerivativePriceFeed {
    function calcUnderlyingValues(address, uint256) external returns (address[] memory, uint256[] memory);

    function isSupportedAsset(address) external view returns (bool);
}
