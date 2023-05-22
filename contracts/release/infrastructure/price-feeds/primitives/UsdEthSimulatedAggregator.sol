// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../external-interfaces/IChainlinkAggregator.sol";

/// @title UsdEthSimulatedAggregator Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A simulated aggregator for providing the inverse rate of the Chainlink ETH/USD aggregator
contract UsdEthSimulatedAggregator {
    // The quote asset of this feed is ETH, so 18 decimals makes sense,
    // both in terms of a mocked Chainlink aggregator and for greater precision
    uint8 private constant DECIMALS = 18;
    // 10 ** (Local precision (DECIMALS) + EthUsd aggregator decimals)
    int256 private constant INVERSE_RATE_NUMERATOR = 10**26;

    IChainlinkAggregator private immutable ETH_USD_AGGREGATOR_CONTRACT;

    constructor(address _ethUsdAggregator) public {
        ETH_USD_AGGREGATOR_CONTRACT = IChainlinkAggregator(_ethUsdAggregator);
    }

    /// @notice The decimals used for rate precision of this simulated aggregator
    /// @return decimals_ The number of decimals
    function decimals() external pure returns (uint8 decimals_) {
        return DECIMALS;
    }

    /// @notice The latest round data for this simulated aggregator
    /// @return roundId_ The `roundId` value returned by the Chainlink aggregator
    /// @return answer_ The `answer` value returned by the Chainlink aggregator, inverted to USD/ETH
    /// @return startedAt_ The `startedAt` value returned by the Chainlink aggregator
    /// @return updatedAt_ The `updatedAt` value returned by the Chainlink aggregator
    /// @return answeredInRound_ The `answeredInRound` value returned by the Chainlink aggregator
    /// @dev All values are returned directly from the target Chainlink ETH/USD aggregator,
    /// other than `answer_`, which is inverted to give the USD/ETH rate,
    /// and is given the local precision of `DECIMALS`.
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId_,
            int256 answer_,
            uint256 startedAt_,
            uint256 updatedAt_,
            uint80 answeredInRound_
        )
    {
        int256 ethUsdAnswer;
        (
            roundId_,
            ethUsdAnswer,
            startedAt_,
            updatedAt_,
            answeredInRound_
        ) = ETH_USD_AGGREGATOR_CONTRACT.latestRoundData();

        // Does not attempt to make sense of a negative answer
        if (ethUsdAnswer > 0) {
            answer_ = INVERSE_RATE_NUMERATOR / ethUsdAnswer;
        }

        return (roundId_, answer_, startedAt_, updatedAt_, answeredInRound_);
    }
}
