// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {PriceFeedHelpersLib} from "../utils/PriceFeedHelpersLib.sol";
import {RateAggregatorBase} from "./utils/RateAggregatorBase.sol";

/// @title ConvertedQuoteAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Converts an aggregator's rate to a new quote asset and/or precision
contract ConvertedQuoteAggregator is RateAggregatorBase {
    // Immutables: deployer-input
    /// @dev `SOURCE_AGGREGATOR_ADDRESS`: the aggregator to convert
    address public immutable SOURCE_AGGREGATOR_ADDRESS;

    // Immutables: derived
    /// @dev `SOURCE_AGGREGATOR_PRECISION`: the precision of `SOURCE_AGGREGATOR_ADDRESS`
    uint256 internal immutable SOURCE_AGGREGATOR_PRECISION;

    constructor(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _sourceAggregatorAddress
    )
        RateAggregatorBase(_thisAggregatorDecimals, _quoteConversionAggregatorAddress, _quoteConversionAggregatorInverted)
    {
        SOURCE_AGGREGATOR_ADDRESS = _sourceAggregatorAddress;
        SOURCE_AGGREGATOR_PRECISION =
            PriceFeedHelpersLib.parsePrecisionFromChainlinkAggregator(_sourceAggregatorAddress);
    }

    //==================================================================================================================
    // Required overrides: RateAggregatorBase
    //==================================================================================================================

    /// @inheritdoc RateAggregatorBase
    /// @dev Returns the source aggregator rate and timestamp
    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        ratePrecision_ = SOURCE_AGGREGATOR_PRECISION;
        (rate_, timestamp_) = PriceFeedHelpersLib.parseRateFromChainlinkAggregator(SOURCE_AGGREGATOR_ADDRESS);
    }
}
