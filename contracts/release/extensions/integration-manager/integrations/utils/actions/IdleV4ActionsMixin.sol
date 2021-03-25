// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IIdleTokenV4.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title IdleV4ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with Idle tokens (V4)
abstract contract IdleV4ActionsMixin is AssetHelpers {
    address private constant IDLE_V4_REFERRAL_ACCOUNT = 0x1ad1fc9964c551f456238Dd88D6a38344B5319D7;

    /// @dev Helper to claim gov token rewards for an IdleToken balance.
    /// Requires that the current contract has already been transferred the idleToken balance.
    function __idleV4ClaimRewards(address _idleToken) internal {
        IIdleTokenV4(_idleToken).redeemIdleToken(0);
    }

    /// @dev Helper to get all rewards tokens for a specified idleToken
    function __idleV4GetRewardsTokens(address _idleToken)
        internal
        view
        returns (address[] memory rewardsTokens_)
    {
        IIdleTokenV4 idleTokenContract = IIdleTokenV4(_idleToken);

        rewardsTokens_ = new address[](idleTokenContract.getGovTokensAmounts(address(0)).length);
        for (uint256 i; i < rewardsTokens_.length; i++) {
            rewardsTokens_[i] = IIdleTokenV4(idleTokenContract).govTokens(i);
        }

        return rewardsTokens_;
    }

    /// @dev Helper to lend underlying for IdleToken
    function __idleV4Lend(
        address _idleToken,
        address _underlying,
        uint256 _underlyingAmount
    ) internal {
        __approveAssetMaxAsNeeded(_underlying, _idleToken, _underlyingAmount);
        IIdleTokenV4(_idleToken).mintIdleToken(_underlyingAmount, true, IDLE_V4_REFERRAL_ACCOUNT);
    }

    /// @dev Helper to redeem IdleToken for underlying
    function __idleV4Redeem(address _idleToken, uint256 _idleTokenAmount) internal {
        IIdleTokenV4(_idleToken).redeemIdleToken(_idleTokenAmount);
    }
}
