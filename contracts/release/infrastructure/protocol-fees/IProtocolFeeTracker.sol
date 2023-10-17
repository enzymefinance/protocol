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
    function getFeeBpsDefault() external view returns (uint256 feeBpsDefault_);

    function getFeeBpsForVault(address _vaultProxy) external view returns (uint256 feeBps_);

    function getFeeBpsOverrideForVault(address _vaultProxy) external view returns (uint256 feeBpsOverride_);

    function getLastPaidForVault(address _vaultProxy) external view returns (uint256 lastPaid_);

    function initializeForVault(address _vaultProxy) external;

    function payFee() external returns (uint256 sharesDue_);

    function setFeeBpsDefault(uint256 _nextFeeBpsDefault) external;

    function setFeeBpsOverrideForVault(address _vaultProxy, uint256 _nextFeeBpsOverride) external;

    function setLastPaidForVault(address _vaultProxy, uint256 _nextTimestamp) external;
}
