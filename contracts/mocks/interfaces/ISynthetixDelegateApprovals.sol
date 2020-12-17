// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title ISynthetixDelegateApprovals Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISynthetixDelegateApprovals {
    function approveExchangeOnBehalf(address) external;

    function canExchangeFor(address, address) external view returns (bool);
}
