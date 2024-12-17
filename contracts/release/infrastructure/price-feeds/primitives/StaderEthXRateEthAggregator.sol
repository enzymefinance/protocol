// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IChainlinkAggregator} from "../../../../external-interfaces/IChainlinkAggregator.sol";
import {IStaderStakePoolsManager} from "../../../../external-interfaces/IStaderStakePoolsManager.sol";

/// @title StaderEthXRateEthAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Chainlink-like aggregator for Stader's internal ETHx rate
contract StaderEthXRateEthAggregator is IChainlinkAggregator {
    IStaderStakePoolsManager public immutable STADER_STAKE_POOLS_MANAGER;

    constructor(address _staderStakePoolsManagerAddress) {
        STADER_STAKE_POOLS_MANAGER = IStaderStakePoolsManager(_staderStakePoolsManagerAddress);
    }

    /// @notice The decimals used for rate precision of this aggregator
    /// @return decimals_ The number of decimals
    function decimals() external pure override returns (uint8 decimals_) {
        return 18;
    }

    /// @notice The latest round data for this aggregator
    /// @return roundId_ Unused
    /// @return answer_ The ETHx rate from Stader
    /// @return startedAt_ Unused
    /// @return updatedAt_ The current block timestamp
    /// @return answeredInRound_ Unused
    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId_, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80 answeredInRound_)
    {
        answer_ = int256(STADER_STAKE_POOLS_MANAGER.getExchangeRate());

        // No timestamp; set to current block to be ignored
        updatedAt_ = block.timestamp;

        return (roundId_, answer_, startedAt_, updatedAt_, answeredInRound_);
    }
}
