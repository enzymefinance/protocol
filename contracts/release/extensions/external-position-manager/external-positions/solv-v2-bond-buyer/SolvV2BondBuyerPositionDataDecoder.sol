// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title SolvV2BondBuyerPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for SolvV2BondBuyerPosition payloads
abstract contract SolvV2BondBuyerPositionDataDecoder {
    /// @dev Helper to decode args used during the BuyOffering action
    function __decodeBuyOfferingActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint24 offeringId_, uint128 units_)
    {
        return abi.decode(_actionArgs, (uint24, uint128));
    }

    /// @dev Helper to decode args used during the Claim action
    function __decodeClaimActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address voucher_, uint32 tokenId_, uint256 units_)
    {
        return abi.decode(_actionArgs, (address, uint32, uint256));
    }
}
