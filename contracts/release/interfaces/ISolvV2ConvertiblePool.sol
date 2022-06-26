// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ISolvV2ConvertiblePool Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Source: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/convertible-voucher/contracts/ConvertiblePool.sol
interface ISolvV2ConvertiblePool {
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

    function getSettlePrice(uint256 _slot) external view returns (uint128 settlePrice_);

    function getSlotDetail(uint256 _slot)
        external
        view
        returns (ISolvV2ConvertiblePool.SlotDetail memory);

    function slotBalances(uint256 _slotId, address _currency) external returns (uint256 balance_);

    function valueDecimals() external returns (uint8);
}
