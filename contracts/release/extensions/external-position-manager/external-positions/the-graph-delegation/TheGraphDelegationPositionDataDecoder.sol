// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title TheGraphDelegationPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for TheGraphDelegationPosition payloads
abstract contract TheGraphDelegationPositionDataDecoder {
    /// @dev Helper to decode args used during the Delegate action
    function __decodeDelegateActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address indexer_, uint256 tokens_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the Undelegate action
    function __decodeUndelegateActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address indexer_, uint256 shares_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the Withdraw action
    function __decodeWithdrawActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address indexer_, address nextIndexer_)
    {
        return abi.decode(_actionArgs, (address, address));
    }
}
