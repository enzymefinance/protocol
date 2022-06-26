// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ITestSolvV2ConvertiblePool Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Convertible Pool
interface ITestSolvV2ConvertiblePool {
    enum CollateralType {ERC20, VESTING_VOUCHER}

    struct SlotDetail {
        address issuer;
        address fundCurrency;
        uint256 totalValue;
        uint128 lowestPrice;
        uint128 highestPrice;
        uint128 settlePrice;
        uint64 effectiveTime;
        uint64 maturity;
        CollateralType collateralType;
        bool isIssuerRefunded;
        bool isIssuerWithdrawn;
        bool isClaimed;
        bool isValid;
    }

    function refund(uint256 _slot) external;

    function settleConvertiblePrice(uint256 _slot) external;
}
