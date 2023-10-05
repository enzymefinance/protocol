// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IVotiumMultiMerkleStash} from "../../../../../external-interfaces/IVotiumMultiMerkleStash.sol";

/// @title ConvexVotingPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for ConvexVotingPosition payloads
abstract contract ConvexVotingPositionDataDecoder {
    /// @dev Helper to decode args used during the ClaimRewards action
    function __decodeClaimRewardsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address[] memory allTokensToTransfer_,
            bool claimLockerRewards_,
            address[] memory extraRewardTokens_,
            IVotiumMultiMerkleStash.ClaimParam[] memory votiumClaims_,
            bool unstakeCvxCrv_
        )
    {
        return abi.decode(_actionArgs, (address[], bool, address[], IVotiumMultiMerkleStash.ClaimParam[], bool));
    }

    /// @dev Helper to decode args used during the Delegate action
    function __decodeDelegateActionArgs(bytes memory _actionArgs) internal pure returns (address delegatee_) {
        return abi.decode(_actionArgs, (address));
    }

    /// @dev Helper to decode args used during the Lock action
    function __decodeLockActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint256 amount_, uint256 spendRatio_)
    {
        return abi.decode(_actionArgs, (uint256, uint256));
    }
}
