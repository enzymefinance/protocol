// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title LidoWithdrawalsPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for LidoWithdrawalsPosition payloads
abstract contract LidoWithdrawalsPositionDataDecoder {
    /// @dev Helper to decode args used during the ClaimWithdrawals action
    function __decodeClaimWithdrawalsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint256[] memory requestIds_, uint256[] memory hints_)
    {
        return abi.decode(_actionArgs, (uint256[], uint256[]));
    }

    /// @dev Helper to decode args used during the RequestWithdrawals action
    function __decodeRequestWithdrawalsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (uint256[]));
    }
}
