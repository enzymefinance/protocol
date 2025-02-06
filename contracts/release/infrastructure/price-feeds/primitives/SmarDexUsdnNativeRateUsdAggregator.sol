// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ISmarDexOracleMiddleware} from "../../../../external-interfaces/ISmarDexOracleMiddleware.sol";
import {ISmarDexUsdnProtocol} from "../../../../external-interfaces/ISmarDexUsdnProtocol.sol";
import {PriceFeedHelpersLib} from "../utils/PriceFeedHelpersLib.sol";
import {RateAggregatorBase} from "./utils/RateAggregatorBase.sol";
import {RateUsdAggregatorBase} from "./utils/RateUsdAggregatorBase.sol";

/// @title SmarDexUsdnNativeRateUsdAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice USD-quoted aggregator for SmarDex USDN using their native rate
contract SmarDexUsdnNativeRateUsdAggregator is RateUsdAggregatorBase {
    /// @dev `USDN_RATES_PRECISION`: the precision used in USDN rate output
    uint256 private constant USDN_RATES_PRECISION = 10 ** 18;

    // Immutables: deployer-input
    /// @dev `USDN_PROTOCOL`: the main SmarDex USDN protocol contract
    ISmarDexUsdnProtocol public immutable USDN_PROTOCOL;

    constructor(address _usdnProtocolAddress) RateUsdAggregatorBase(address(0), false) {
        USDN_PROTOCOL = ISmarDexUsdnProtocol(_usdnProtocolAddress);
    }

    //==================================================================================================================
    // Required overrides: RateAggregatorBase
    //==================================================================================================================

    /// @inheritdoc RateAggregatorBase
    /// @dev Returns the value of 1 unit of USDN:
    /// - quoted in USD
    /// - with 18-decimals of precision
    /// - with the timestamp returned by USDN oracle middleware
    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        ISmarDexOracleMiddleware middleware = ISmarDexOracleMiddleware(USDN_PROTOCOL.getOracleMiddleware());
        ISmarDexOracleMiddleware.PriceInfo memory priceInfo = middleware.parseAndValidatePrice({
            _actionId: "",
            _targetTimestamp: uint128(block.timestamp),
            _action: ISmarDexUsdnProtocol.ProtocolAction.Initialize,
            _data: ""
        });

        rate_ = USDN_PROTOCOL.usdnPrice({_currentPrice: uint128(priceInfo.neutralPrice)});
        ratePrecision_ = USDN_RATES_PRECISION;
        timestamp_ = priceInfo.timestamp;
    }
}
