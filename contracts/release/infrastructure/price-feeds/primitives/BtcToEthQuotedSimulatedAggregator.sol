// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {TwoAggregatorsWithCommonQuoteSimulatedAggregator} from
    "./utils/TwoAggregatorsWithCommonQuoteSimulatedAggregator.sol";

/// @title BtcToEthQuotedSimulatedAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A simulated ETH-quoted aggregator to support a Chainlink-like aggregator quoted in BTC
contract BtcToEthQuotedSimulatedAggregator is TwoAggregatorsWithCommonQuoteSimulatedAggregator {
    constructor(address _btcQuotedAggregatorAddress, address _ethBtcAggregatorAddress)
        TwoAggregatorsWithCommonQuoteSimulatedAggregator(_btcQuotedAggregatorAddress, _ethBtcAggregatorAddress, 18)
    {}
}
