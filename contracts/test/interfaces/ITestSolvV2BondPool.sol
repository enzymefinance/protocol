// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ITestSolvV2BondPool Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Bond Pool
/// @dev Source: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/bond-voucher/contracts/BondPool.sol
interface ITestSolvV2BondPool {
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

    function getSettlePrice(uint256 _slot) external view returns (uint128 settlePrice_);

    function oracle() external view returns (address oracle_);

    function refund(uint256 _slot) external;

    function setFundCurrency(address _currency, bool _enable) external;

    function setSettlePrice(uint256 _slot) external;
}
