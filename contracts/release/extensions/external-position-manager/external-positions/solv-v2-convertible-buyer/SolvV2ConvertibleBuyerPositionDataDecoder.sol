// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title SolvV2ConvertibleBuyerPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for SolvV2ConvertibleBuyerPosition payloads
abstract contract SolvV2ConvertibleBuyerPositionDataDecoder {
    /// @dev Helper to decode args used during the BuyOffering action
    function __decodeBuyOfferingActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address voucher_,
            uint24 offeringId_,
            uint128 units_
        )
    {
        return abi.decode(_actionArgs, (address, uint24, uint128));
    }

    /// @dev Helper to decode args used during the BuySaleByAmount action
    function __decodeBuySaleByAmountActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint24 saleId_, uint256 amount_)
    {
        return abi.decode(_actionArgs, (uint24, uint256));
    }

    /// @dev Helper to decode args used during the BuySaleByUnits action
    function __decodeBuySaleByUnitsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint24 saleId_, uint128 units_)
    {
        return abi.decode(_actionArgs, (uint24, uint128));
    }

    /// @dev Helper to decode args used during the Claim action
    function __decodeClaimActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address voucher_,
            uint32 tokenId_,
            uint256 units_
        )
    {
        return abi.decode(_actionArgs, (address, uint32, uint256));
    }

    /// @dev Helper to decode args used during the CreateSaleDecliningPrice action
    function __decodeCreateSaleDecliningPriceActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address voucher_,
            uint24 tokenId_,
            address currency_,
            uint128 min_,
            uint128 max_,
            uint32 startTime_,
            bool useAllowList_,
            uint128 highest_,
            uint128 lowest_,
            uint32 duration_,
            uint32 interval_
        )
    {
        return
            abi.decode(
                _actionArgs,
                (
                    address,
                    uint24,
                    address,
                    uint128,
                    uint128,
                    uint32,
                    bool,
                    uint128,
                    uint128,
                    uint32,
                    uint32
                )
            );
    }

    /// @dev Helper to decode args used during the CreateSaleFixedPrice action
    function __decodeCreateSaleFixedPriceActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address voucher_,
            uint24 tokenId_,
            address currency_,
            uint128 min_,
            uint128 max_,
            uint32 startTime_,
            bool useAllowList_,
            uint128 price_
        )
    {
        return
            abi.decode(
                _actionArgs,
                (address, uint24, address, uint128, uint128, uint32, bool, uint128)
            );
    }

    /// @dev Helper to decode args used during the RemoveSale action
    function __decodeRemoveSaleActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint24 saleId_)
    {
        return abi.decode(_actionArgs, (uint24));
    }
}
