// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

/// @title TreasurySplitterMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mixin contract for splitting all tokens amongst participants at a fixed ratio
/// @dev Inheriting contract must call __setSplitRatio() to set the fixed participants ratio
abstract contract TreasurySplitterMixin {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    event SplitPercentageSet(address indexed user, uint256 percentage);

    event TokenClaimed(address indexed user, address indexed token, uint256 amount);

    uint256 internal constant ONE_HUNDRED_PERCENT = 10000;

    // All storage vars private
    mapping(address => uint256) private tokenToTotalBalClaimed;
    mapping(address => uint256) private userToSplitPercentage;
    mapping(address => mapping(address => uint256)) private userToTokenToBalClaimed;

    // EXTERNAL FUNCTIONS

    /// @notice Claims the full amount of a specified token
    /// @param _token The token to claim
    /// @return claimedAmount_ The token amount claimed
    function claimToken(address _token) external virtual returns (uint256 claimedAmount_) {
        return __claimToken(msg.sender, _token, type(uint256).max, msg.sender);
    }

    /// @notice Claims a specified token amount to a specified address
    /// @param _token The token to claim
    /// @param _amount The amount to claim
    /// @param _to The recipient of the claimed token
    /// @return claimedAmount_ The token amount claimed
    function claimTokenAmountTo(
        address _token,
        uint256 _amount,
        address _to
    ) external virtual returns (uint256 claimedAmount_) {
        return __claimToken(msg.sender, _token, _amount, _to);
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the token balance claimable for a specified user
    /// @param _user The user
    /// @param _token The token
    /// @return balClaimable_ The claimable token balance
    function getTokenBalClaimableForUser(address _user, address _token)
        public
        view
        returns (uint256 balClaimable_)
    {
        return
            __calcTokenBalClaimable(
                getSplitPercentageForUser(_user),
                getTokenBalClaimedForUser(_user, _token),
                getTotalTokenBalClaimed(_token).add(ERC20(_token).balanceOf(address(this)))
            );
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to calculate a claimable token balance
    function __calcTokenBalClaimable(
        uint256 _splitPercentageForUser,
        uint256 _balClaimedForUser,
        uint256 _totalCumulativeBal
    ) internal pure returns (uint256 balClaimable_) {
        uint256 totalCumulativeBalShareForUser = _totalCumulativeBal
            .mul(_splitPercentageForUser)
            .div(ONE_HUNDRED_PERCENT);

        return totalCumulativeBalShareForUser.sub(_balClaimedForUser);
    }

    /// @dev Helper to claim tokens
    function __claimToken(
        address _user,
        address _token,
        uint256 _amount,
        address _to
    ) internal returns (uint256 claimedAmount_) {
        claimedAmount_ = __claimTokenWithoutTransfer(_user, _token, _amount);
        ERC20(_token).safeTransfer(_to, claimedAmount_);

        return claimedAmount_;
    }

    /// @dev Helper to claim tokens, but not transfer them (i.e., perform some other action)
    function __claimTokenWithoutTransfer(
        address _user,
        address _token,
        uint256 _amount
    ) internal returns (uint256 claimedAmount_) {
        uint256 totalBalClaimed = getTotalTokenBalClaimed(_token);
        uint256 balClaimedForUser = getTokenBalClaimedForUser(_user, _token);

        uint256 totalCumulativeBal = totalBalClaimed.add(ERC20(_token).balanceOf(address(this)));
        uint256 claimableBalForUser = __calcTokenBalClaimable(
            getSplitPercentageForUser(_user),
            balClaimedForUser,
            totalCumulativeBal
        );

        if (_amount == type(uint256).max) {
            claimedAmount_ = claimableBalForUser;
        } else {
            require(_amount <= claimableBalForUser, "claimToken: _amount exceeds claimable");

            claimedAmount_ = _amount;
        }

        // Update total and user claim amounts
        tokenToTotalBalClaimed[_token] = totalBalClaimed.add(claimedAmount_);
        userToTokenToBalClaimed[_user][_token] = balClaimedForUser.add(claimedAmount_);

        emit TokenClaimed(_user, _token, claimedAmount_);

        return claimedAmount_;
    }

    /// @dev Helper to set the desired treasury split ratio.
    /// Uses `memory` instead of `calldata` in case implementing contract cannot pass `calldata`,
    /// e.g., in its constructor().
    function __setSplitRatio(address[] memory _users, uint256[] memory _splitPercentages)
        internal
    {
        uint256 totalSplitPercentage;
        for (uint256 i; i < _users.length; i++) {
            // Do not allow zero-addresses or duplicate users
            require(_users[i] != address(0), "__setSplitRatio: Empty user");
            for (uint256 j = i + 1; j < _users.length; j++) {
                require(_users[i] != _users[j], "__setSplitRatio: Duplicate user");
            }

            userToSplitPercentage[_users[i]] = _splitPercentages[i];
            totalSplitPercentage = totalSplitPercentage.add(_splitPercentages[i]);

            emit SplitPercentageSet(_users[i], _splitPercentages[i]);
        }
        require(totalSplitPercentage == ONE_HUNDRED_PERCENT, "__setSplitRatio: Split not 100%");
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the split ratio percentage for a given user
    /// @param _user The user
    /// @return splitPercentage_ The split percentage
    function getSplitPercentageForUser(address _user)
        public
        view
        returns (uint256 splitPercentage_)
    {
        return userToSplitPercentage[_user];
    }

    /// @notice Gets the token balance already claimed for a given user
    /// @param _user The user
    /// @param _token The token
    /// @return balClaimed_ The balance claimed
    function getTokenBalClaimedForUser(address _user, address _token)
        public
        view
        returns (uint256 balClaimed_)
    {
        return userToTokenToBalClaimed[_user][_token];
    }

    /// @notice Gets the total token balance already claimed
    /// @param _token The token
    /// @return totalBalClaimed_ The total balance claimed
    function getTotalTokenBalClaimed(address _token)
        public
        view
        returns (uint256 totalBalClaimed_)
    {
        return tokenToTotalBalClaimed[_token];
    }
}
