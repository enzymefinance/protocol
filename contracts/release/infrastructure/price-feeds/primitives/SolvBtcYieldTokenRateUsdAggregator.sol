// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../external-interfaces/IERC20.sol";
import {ISolvBTCYieldToken} from "../../../../external-interfaces/ISolvBTCYieldToken.sol";
import {RateAggregatorBase} from "./utils/RateAggregatorBase.sol";
import {RateUsdAggregatorBase} from "./utils/RateUsdAggregatorBase.sol";

/// @title SolvBtcYieldTokenRateUsdAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice USD-quoted aggregator for a Solv BTC yield token instance
contract SolvBtcYieldTokenRateUsdAggregator is RateUsdAggregatorBase {
    uint256 private constant SOLV_BTC_PRECISION = 10 ** 18;

    ISolvBTCYieldToken public immutable SOLV_BTC_YIELD_TOKEN;
    uint256 private immutable SOLV_BTC_YIELD_TOKEN_PRECISION;

    constructor(address _solvBtcUsdAggregatorAddress, address _solvBtcYieldTokenAddress)
        RateUsdAggregatorBase(_solvBtcUsdAggregatorAddress, false)
    {
        SOLV_BTC_YIELD_TOKEN = ISolvBTCYieldToken(_solvBtcYieldTokenAddress);

        // All Solv BTC tokens should have 18 decimals, but check to be sure
        SOLV_BTC_YIELD_TOKEN_PRECISION = 10 ** IERC20(_solvBtcYieldTokenAddress).decimals();
    }

    //==================================================================================================================
    // Required overrides: RateAggregatorBase
    //==================================================================================================================

    /// @inheritdoc RateAggregatorBase
    /// @dev Returns the value of 1 unit of SOLV BTC yield token, quoted in SOLV BTC (i.e., SolvBTCYieldToken/SolvBTC)
    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        rate_ = SOLV_BTC_YIELD_TOKEN.getValueByShares(SOLV_BTC_YIELD_TOKEN_PRECISION);
        ratePrecision_ = SOLV_BTC_PRECISION;
        timestamp_ = block.timestamp;
    }
}
