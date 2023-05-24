// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

/// @title ISolvV2BondPool Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Source: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/bond-voucher/contracts/BondPool.sol
interface ISolvV2BondPool {
    enum CollateralType {
        ERC20,
        VESTING_VOUCHER
    }

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

    function getIssuerSlots(address _issuer) external view returns (uint256[] memory slots_);

    function getSettlePrice(uint256 _slot) external view returns (uint128 settlePrice_);

    function getSlotDetail(uint256 _slot) external view returns (SlotDetail memory slotDetail_);

    function getWithdrawableAmount(uint256 _slot) external view returns (uint256 withdrawTokenAmount_);

    function refund(uint256 _slot) external;

    function slotBalances(uint256 _slotId, address _currency) external view returns (uint256 balance_);

    function valueDecimals() external view returns (uint8 decimals_);

    function withdraw(uint256 _slot) external returns (uint256 withdrawTokenAmount_);
}
