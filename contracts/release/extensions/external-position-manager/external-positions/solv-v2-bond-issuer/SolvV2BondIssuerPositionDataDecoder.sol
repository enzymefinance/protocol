// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";

/// @title SolvV2BondIssuerPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for SolvV2BondIssuerPosition payloads
abstract contract SolvV2BondIssuerPositionDataDecoder {
    /// @dev Helper to decode args used during the CreateOffer action
    function __decodeCreateOfferActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address voucher_,
            address currency_,
            uint128 min_,
            uint128 max_,
            uint32 startTime_,
            uint32 endTime_,
            bool useAllowList_,
            ISolvV2InitialConvertibleOfferingMarket.PriceType priceType_,
            bytes memory priceData,
            ISolvV2InitialConvertibleOfferingMarket.MintParameter memory mintParameter_
        )
    {
        return (
            abi.decode(
                _actionArgs,
                (
                    address,
                    address,
                    uint128,
                    uint128,
                    uint32,
                    uint32,
                    bool,
                    ISolvV2InitialConvertibleOfferingMarket.PriceType,
                    bytes,
                    ISolvV2InitialConvertibleOfferingMarket.MintParameter
                )
            )
        );
    }

    /// @dev Helper to decode args used during the Refund action
    function __decodeRefundActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address voucher_, uint256 slotId_)
    {
        return (abi.decode(_actionArgs, (address, uint256)));
    }

    /// @dev Helper to decode args used during the RemoveOffer action
    function __decodeRemoveOfferActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint24 offerId_)
    {
        return (abi.decode(_actionArgs, (uint24)));
    }

    /// @dev Helper to decode args used during the Withdraw action
    function __decodeWithdrawActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address voucher_, uint256 slotId_)
    {
        return (abi.decode(_actionArgs, (address, uint256)));
    }
}
