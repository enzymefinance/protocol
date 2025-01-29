// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IChainlinkAggregator} from "../../../../external-interfaces/IChainlinkAggregator.sol";
import {ISmarDexUsdnProtocol} from "../../../../external-interfaces/ISmarDexUsdnProtocol.sol";
import {PriceFeedHelpersLib} from "../utils/PriceFeedHelpersLib.sol";
import {RateAggregatorBase} from "./utils/RateAggregatorBase.sol";
import {RateUsdAggregatorBase} from "./utils/RateUsdAggregatorBase.sol";

/// @title SmarDexUsdnNativeRateUsdAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice USD-quoted aggregator for SmarDex USDN using their native rate
contract SmarDexUsdnNativeRateUsdAggregator is RateUsdAggregatorBase {
    /// @dev `USDN_RATES_PRECISION`: the precision used in USDN for both wsteth/usd rate input and USDN rate output
    uint256 private constant USDN_RATES_PRECISION = 10 ** 18;

    // Immutables: deployer-input
    /// @dev `USDN_PROTOCOL`: the main SmarDex USDN protocol contract
    ISmarDexUsdnProtocol public immutable USDN_PROTOCOL;
    /// @dev `WSTETH_IN_USD_AGGREGATOR_ADDRESS`: the wstETH/USD aggregator to use as input for the USDN rate function
    address public immutable WSTETH_IN_USD_AGGREGATOR_ADDRESS;
    // Immutables: derived
    /// @dev `WSTETH_IN_USD_AGGREGATOR_PRECISION`: the precision of WSTETH_IN_USD_AGGREGATOR_ADDRESS
    uint256 private immutable WSTETH_IN_USD_AGGREGATOR_PRECISION;

    constructor(address _usdnProtocolAddress, address _wstethInUsdAggregatorAddress)
        RateUsdAggregatorBase(address(0), false)
    {
        USDN_PROTOCOL = ISmarDexUsdnProtocol(_usdnProtocolAddress);
        WSTETH_IN_USD_AGGREGATOR_ADDRESS = _wstethInUsdAggregatorAddress;

        WSTETH_IN_USD_AGGREGATOR_PRECISION =
            PriceFeedHelpersLib.parsePrecisionFromChainlinkAggregator(_wstethInUsdAggregatorAddress);
    }

    //==================================================================================================================
    // Required overrides: RateAggregatorBase
    //==================================================================================================================

    /// @inheritdoc RateAggregatorBase
    /// @dev Returns the value of 1 unit of USDN:
    /// - quoted in USD
    /// - with 18-decimals of precision
    /// - with the wstETH/USD aggregator's timestamp
    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        // Get the wstETH/USD rate
        (uint256 wstethInUsdRateInAggregatorPrecision, uint256 wstethInUsdRateTimestamp) =
            PriceFeedHelpersLib.parseRateFromChainlinkAggregator(WSTETH_IN_USD_AGGREGATOR_ADDRESS);

        // Convert wstETH/USD rate to USDN's expected precision
        uint256 wstethInUsdRateWithWeiPrecision = PriceFeedHelpersLib.convertRatePrecision({
            _rate: wstethInUsdRateInAggregatorPrecision,
            _fromPrecision: WSTETH_IN_USD_AGGREGATOR_PRECISION,
            _toPrecision: USDN_RATES_PRECISION
        });

        rate_ = USDN_PROTOCOL.usdnPrice({_wstethInUsdRateWithWeiPrecision: uint128(wstethInUsdRateWithWeiPrecision)});
        ratePrecision_ = USDN_RATES_PRECISION;
        timestamp_ = wstethInUsdRateTimestamp;
    }
}
