// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title ISynthetix Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISynthetix {
    function exchangeOnBehalfWithTracking(
        address,
        bytes32,
        uint256,
        bytes32,
        address,
        bytes32
    ) external returns (uint256);
}
