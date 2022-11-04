// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/ICompoundV3Comet.sol";
import "../../../../../interfaces/ICompoundV3CometRewards.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title CompoundV3ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Compound V3 lending functions
abstract contract CompoundV3ActionsMixin is AssetHelpers {
    ICompoundV3CometRewards private immutable COMPOUND_V3_REWARDS_CONTRACT;

    constructor(address _compoundV3Rewards) public {
        COMPOUND_V3_REWARDS_CONTRACT = ICompoundV3CometRewards(_compoundV3Rewards);
    }

    /// @dev Helper to execute claiming rewards on Compound V3
    function __compoundV3ClaimRewards(address _cToken, address _src) internal {
        COMPOUND_V3_REWARDS_CONTRACT.claim({_cToken: _cToken, _src: _src, _shouldAccrue: true});
    }

    /// @dev Helper to execute lending on Compound V3
    function __compoundV3Lend(
        address _underlying,
        address _cToken,
        address _recipient,
        uint256 _amount
    ) internal {
        __approveAssetMaxAsNeeded({_asset: _underlying, _target: _cToken, _neededAmount: _amount});

        ICompoundV3Comet(_cToken).supplyTo({
            _asset: _underlying,
            _amount: _amount,
            _dst: _recipient
        });
    }

    /// @dev Helper to execute redeeming on Compound V3
    function __compoundV3Redeem(
        address _cToken,
        address _underlying,
        address _recipient,
        uint256 _amount
    ) internal {
        ICompoundV3Comet(_cToken).withdrawTo({
            _asset: _underlying,
            _amount: _amount,
            _dst: _recipient
        });
    }
}
