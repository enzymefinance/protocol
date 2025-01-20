// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {RateAggregatorBase} from "./RateAggregatorBase.sol";

/// @title RateEthAggregatorBase Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Base contract for Chainlink-like aggregators quoted in ETH
abstract contract RateEthAggregatorBase is RateAggregatorBase {
    constructor(address _quoteConversionAggregatorAddress, bool _quoteConversionAggregatorInverted)
        RateAggregatorBase(18, _quoteConversionAggregatorAddress, _quoteConversionAggregatorInverted)
    {}
}
