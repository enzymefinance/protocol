// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IPoolTogetherV4PrizeDistributor interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPoolTogetherV4PrizeDistributor {
    function claim(
        address,
        uint32[] calldata,
        bytes calldata
    ) external returns (uint256);
}
