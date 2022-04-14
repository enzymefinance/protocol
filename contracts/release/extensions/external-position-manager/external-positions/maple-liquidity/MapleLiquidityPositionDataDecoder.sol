// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title MapleLiquidityPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for MapleLiquidityPosition payloads
abstract contract MapleLiquidityPositionDataDecoder {
    /// @dev Helper to decode args used during the ClaimInterest action
    function __decodeClaimInterestActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_)
    {
        return abi.decode(_actionArgs, (address));
    }

    /// @dev Helper to decode args used during the ClaimRewards action
    function __decodeClaimRewardsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address rewardsContract_)
    {
        return abi.decode(_actionArgs, (address));
    }

    /// @dev Helper to decode args used during the Lend action
    function __decodeLendActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_, uint256 liquidityAssetAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the LendAndStake action
    function __decodeLendAndStakeActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address pool_,
            address rewardsContract_,
            uint256 liquidityAssetAmount_
        )
    {
        return abi.decode(_actionArgs, (address, address, uint256));
    }

    /// @dev Helper to decode args used during the IntendToRedeem action
    function __decodeIntendToRedeemActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_)
    {
        return abi.decode(_actionArgs, (address));
    }

    /// @dev Helper to decode args used during the Redeem action
    function __decodeRedeemActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_, uint256 liquidityAssetAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the Stake action
    function __decodeStakeActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address rewardsContract_,
            address pool_,
            uint256 poolTokenAmount_
        )
    {
        return abi.decode(_actionArgs, (address, address, uint256));
    }

    /// @dev Helper to decode args used during the Unstake action
    function __decodeUnstakeActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address rewardsContract_, uint256 poolTokenAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the UnstakeAndRedeem action
    function __decodeUnstakeAndRedeemActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address pool_,
            address rewardsContract_,
            uint256 poolTokenAmount_
        )
    {
        return abi.decode(_actionArgs, (address, address, uint256));
    }
}
