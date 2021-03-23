// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/ICurveMinter.sol";
import "../../../../../utils/AddressArrayLib.sol";
import "./CurveGaugeV2ActionsMixin.sol";

/// @title CurveGaugeV2RewardsHandlerBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base contract for handling claiming and reinvesting rewards for a Curve pool
/// that uses the LiquidityGaugeV2 contract
abstract contract CurveGaugeV2RewardsHandlerBase is CurveGaugeV2ActionsMixin {
    using AddressArrayLib for address[];

    address private immutable CURVE_GAUGE_V2_REWARDS_HANDLER_CRV_TOKEN;
    address private immutable CURVE_GAUGE_V2_REWARDS_HANDLER_MINTER;

    constructor(address _minter, address _crvToken) public {
        CURVE_GAUGE_V2_REWARDS_HANDLER_CRV_TOKEN = _crvToken;
        CURVE_GAUGE_V2_REWARDS_HANDLER_MINTER = _minter;
    }

    /// @dev Helper to claim all rewards (CRV and pool-specific).
    /// Requires contract to be approved to use mint_for().
    function __curveGaugeV2ClaimAllRewards(address _gauge, address _target) internal {
        // Claim owed $CRV
        ICurveMinter(CURVE_GAUGE_V2_REWARDS_HANDLER_MINTER).mint_for(_gauge, _target);

        // Claim owed pool-specific rewards
        __curveGaugeV2ClaimRewards(_gauge, _target);
    }

    /// @dev Helper to claim all rewards, then pull either the newly claimed balances only,
    /// or full vault balances into the current contract
    function __curveGaugeV2ClaimRewardsAndPullBalances(
        address _gauge,
        address _target,
        bool _useFullBalances
    )
        internal
        returns (address[] memory rewardsTokens_, uint256[] memory rewardsTokenAmountsPulled_)
    {
        if (_useFullBalances) {
            return __curveGaugeV2ClaimRewardsAndPullFullBalances(_gauge, _target);
        }

        return __curveGaugeV2ClaimRewardsAndPullClaimedBalances(_gauge, _target);
    }

    /// @dev Helper to claim all rewards, then pull only the newly claimed balances
    /// of all rewards tokens into the current contract
    function __curveGaugeV2ClaimRewardsAndPullClaimedBalances(address _gauge, address _target)
        internal
        returns (address[] memory rewardsTokens_, uint256[] memory rewardsTokenAmountsPulled_)
    {
        rewardsTokens_ = __curveGaugeV2GetRewardsTokensWithCrv(_gauge);

        uint256[] memory rewardsTokenPreClaimBalances = new uint256[](rewardsTokens_.length);
        for (uint256 i; i < rewardsTokens_.length; i++) {
            rewardsTokenPreClaimBalances[i] = ERC20(rewardsTokens_[i]).balanceOf(_target);
        }

        __curveGaugeV2ClaimAllRewards(_gauge, _target);

        rewardsTokenAmountsPulled_ = __pullPartialAssetBalances(
            _target,
            rewardsTokens_,
            rewardsTokenPreClaimBalances
        );

        return (rewardsTokens_, rewardsTokenAmountsPulled_);
    }

    /// @dev Helper to claim all rewards, then pull the full balances of all rewards tokens
    /// in the target into the current contract
    function __curveGaugeV2ClaimRewardsAndPullFullBalances(address _gauge, address _target)
        internal
        returns (address[] memory rewardsTokens_, uint256[] memory rewardsTokenAmountsPulled_)
    {
        __curveGaugeV2ClaimAllRewards(_gauge, _target);

        rewardsTokens_ = __curveGaugeV2GetRewardsTokensWithCrv(_gauge);
        rewardsTokenAmountsPulled_ = __pullFullAssetBalances(_target, rewardsTokens_);

        return (rewardsTokens_, rewardsTokenAmountsPulled_);
    }

    /// @dev Helper to get all rewards tokens for staking LP tokens
    function __curveGaugeV2GetRewardsTokensWithCrv(address _gauge)
        internal
        view
        returns (address[] memory rewardsTokens_)
    {
        return
            __curveGaugeV2GetRewardsTokens(_gauge).addUniqueItem(
                CURVE_GAUGE_V2_REWARDS_HANDLER_CRV_TOKEN
            );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_GAUGE_V2_REWARDS_HANDLER_CRV_TOKEN` variable
    /// @return crvToken_ The `CURVE_GAUGE_V2_REWARDS_HANDLER_CRV_TOKEN` variable value
    function getCurveGaugeV2RewardsHandlerCrvToken() public view returns (address crvToken_) {
        return CURVE_GAUGE_V2_REWARDS_HANDLER_CRV_TOKEN;
    }

    /// @notice Gets the `CURVE_GAUGE_V2_REWARDS_HANDLER_MINTER` variable
    /// @return minter_ The `CURVE_GAUGE_V2_REWARDS_HANDLER_MINTER` variable value
    function getCurveGaugeV2RewardsHandlerMinter() public view returns (address minter_) {
        return CURVE_GAUGE_V2_REWARDS_HANDLER_MINTER;
    }
}
