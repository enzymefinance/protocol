// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {AggregatorRateDeviationMixin} from
    "../release/infrastructure/price-feeds/primitives/utils/AggregatorRateDeviationMixin.sol";

/// @title AggregatorRateDeviationMixinHarness Contract
/// @author Enzyme Foundation <security@enzyme.finance>
contract AggregatorRateDeviationMixinHarness is AggregatorRateDeviationMixin {
    constructor(address _marketAggregatorAddress, uint256 _deviationToleranceBps)
        AggregatorRateDeviationMixin(_marketAggregatorAddress, _deviationToleranceBps)
    {}

    function exposed_rateByDeviation(uint256 _idealRate, uint256 _idealRatePrecision, uint256 _idealRateTimestamp)
        external
        view
        returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_)
    {
        return __rateByDeviation(_idealRate, _idealRatePrecision, _idealRateTimestamp);
    }
}
