// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ITestSolvV2ConvertibleMarket Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Initial Convertible Offering Market
interface ITestSolvV2ConvertibleMarket {
    enum FeeType {BY_AMOUNT, FIXED}

    enum FeePayType {SELLER_PAY, BUYER_PAY}

    enum PriceType {FIXED, DECLIINING_BY_TIME}

    struct Market {
        bool isValid;
        uint128 precision;
        FeeType feeType;
        FeePayType feePayType;
        uint128 feeAmount;
        uint16 feeRate;
    }

    struct Sale {
        uint24 saleId;
        uint24 tokenId;
        uint32 startTime;
        address seller;
        PriceType priceType;
        uint128 total;
        uint128 units;
        uint128 min;
        uint128 max;
        address voucher;
        address currency;
        bool useAllowList;
        bool isValid;
    }

    function buyByAmount(uint24 _saleId, uint256 _amount)
        external
        payable
        returns (uint128 units_);

    function buyByUnits(uint24 _saleId, uint128 _units)
        external
        payable
        returns (uint256 amount_, uint128 fee_);

    function getDecliningPrice(uint24 _offeringId)
        external
        view
        returns (
            uint128 highest_,
            uint128 lowest_,
            uint32 startTime_,
            uint32 duration_,
            uint32 interval_
        );

    function getFixedPrice(uint24 _offeringId) external view returns (uint128 price_);

    function getPrice(uint24 _saleId) external returns (uint128 price_);

    function markets(address _voucher) external returns (Market memory market_);

    function nextSaleId() external returns (uint24 saleId_);

    function publishFixedPrice(
        address _voucher,
        uint24 _tokenId,
        address _currency,
        uint128 _min,
        uint128 _max,
        uint32 _startTime,
        bool _useAllowList,
        uint128 _price
    ) external returns (uint24 saleId_);

    function price(PriceType _priceType, uint24 _saleId) external returns (uint128 price_);

    function publishDecliningPrice(
        address _voucher,
        uint24 _tokenId,
        address _currency,
        uint128 _min,
        uint128 _max,
        uint32 _startTime,
        bool _useAllowList,
        uint128 _highest,
        uint128 _lowest,
        uint32 _duration,
        uint32 _interval
    ) external returns (uint24 saleId_);

    function sales(uint24 _saleId) external returns (Sale memory sale_);

    function remove(uint24 _saleId) external;
}
