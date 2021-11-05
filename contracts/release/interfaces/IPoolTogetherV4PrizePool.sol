// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IPoolTogetherV4PrizePool interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPoolTogetherV4PrizePool {
    function getToken() external view returns (address);

    function depositToAndDelegate(
        address,
        uint256,
        address
    ) external;

    function withdrawFrom(address, uint256) external returns (uint256);
}
