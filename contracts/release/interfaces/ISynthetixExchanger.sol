// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ISynthetixExchanger Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISynthetixExchanger {
    function getAmountsForExchange(
        uint256,
        bytes32,
        bytes32
    )
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function settle(address, bytes32)
        external
        returns (
            uint256,
            uint256,
            uint256
        );
}
