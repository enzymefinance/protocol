// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title ISynthetixExchanger Interface
/// @author Melon Council DAO <security@meloncoucil.io>
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
}
