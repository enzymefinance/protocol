// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../../../utils/0.6.12/AssetHelpers.sol";
import "../../../../../../infrastructure/staking-wrappers/IStakingWrapper.sol";

/// @title StakingWrapperActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with IStakingWrapper implementations
abstract contract StakingWrapperActionsMixin is AssetHelpers {
    /// @dev Helper to claim rewards via a IStakingWrapper implementation
    function __stakingWrapperClaimRewardsFor(address _wrapper, address _for) internal {
        IStakingWrapper(_wrapper).claimRewardsFor(_for);
    }

    /// @dev Helper to stake via a IStakingWrapper implementation
    function __stakingWrapperStake(address _wrapper, address _to, uint256 _amount, address _outgoingAsset) internal {
        __approveAssetMaxAsNeeded(_outgoingAsset, _wrapper, _amount);
        IStakingWrapper(_wrapper).depositTo(_to, _amount);
    }

    /// @dev Helper to unstake via a IStakingWrapper implementation
    function __stakingWrapperUnstake(address _wrapper, address _from, address _to, uint256 _amount, bool _claimRewards)
        internal
    {
        if (_from == address(this)) {
            IStakingWrapper(_wrapper).withdrawTo({_to: _to, _amount: _amount, _claimRewardsToHolder: _claimRewards});
        } else {
            IStakingWrapper(_wrapper).withdrawToOnBehalf({
                _onBehalf: _from,
                _to: _to,
                _amount: _amount,
                _claimRewardsToHolder: _claimRewards
            });
        }
    }
}
