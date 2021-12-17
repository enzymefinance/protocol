// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IOlympusV2Staking.sol";

/// @title OlympusV2ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the OlympusV2 functions
abstract contract OlympusV2ActionMixin {
    address private immutable OLYMPUS_V2_STAKING_CONTRACT;

    constructor(address _stakingContract) public {
        OLYMPUS_V2_STAKING_CONTRACT = _stakingContract;
    }

    /// @dev Helper to stake on OlympusDAO v2
    function __olympusV2Stake(address _vaultProxy, uint256 _outgoingAssetAmount) internal {
        IOlympusV2Staking(getOlympusV2StakingContract()).stake(
            _vaultProxy,
            _outgoingAssetAmount,
            true,
            true
        );
    }

    /// @dev Helper to unstake from OlympusDAO v2
    function __olympusV2Unstake(address _vaultProxy, uint256 _outgoingAssetAmount) internal {
        IOlympusV2Staking(getOlympusV2StakingContract()).unstake(
            _vaultProxy,
            _outgoingAssetAmount,
            false,
            true
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `OLYMPUS_V2_STAKING_CONTRACT` variable
    /// @return stakingContract_ The `OLYMPUS_V2_STAKING_CONTRACT` variable value
    function getOlympusV2StakingContract() public view returns (address stakingContract_) {
        return OLYMPUS_V2_STAKING_CONTRACT;
    }
}
