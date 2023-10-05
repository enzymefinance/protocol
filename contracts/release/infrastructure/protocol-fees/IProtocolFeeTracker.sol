// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IProtocolFeeTracker Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IProtocolFeeTracker {
    function getFeeBpsForVault(address _vaultProxy) external view returns (uint256 feeBps_);

    function getLastPaidForVault(address _vaultProxy) external view returns (uint256 lastPaid_);

    function initializeForVault(address) external;

    function payFee() external returns (uint256);
}
