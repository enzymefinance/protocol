// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {PeggedRateDeviationAggregator} from "../PeggedRateDeviationAggregator.sol";

/// @title PeggedRateDeviationAggregatorFactory Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Factory for PeggedRateDeviationAggregator
contract PeggedRateDeviationAggregatorFactory {
    uint8 constant ETH_QUOTE_DECIMALS = 18;
    uint8 constant USD_QUOTE_DECIMALS = 8;

    event InstanceDeployed(address instanceAddress);

    function deployEth(address _marketAggregatorAddress, uint256 _deviationToleranceBps) external {
        deployVerbose({
            _thisAggregatorDecimals: ETH_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false,
            _marketAggregatorAddress: _marketAggregatorAddress,
            _deviationToleranceBps: _deviationToleranceBps
        });
    }

    function deployEthWithQuote(
        address _quoteConversionAggregatorAddress,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    ) external {
        deployVerbose({
            _thisAggregatorDecimals: ETH_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: false,
            _marketAggregatorAddress: _marketAggregatorAddress,
            _deviationToleranceBps: _deviationToleranceBps
        });
    }

    function deployEthWithQuoteInverse(
        address _quoteConversionAggregatorAddress,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    ) external {
        deployVerbose({
            _thisAggregatorDecimals: ETH_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: true,
            _marketAggregatorAddress: _marketAggregatorAddress,
            _deviationToleranceBps: _deviationToleranceBps
        });
    }

    function deployUsd(address _marketAggregatorAddress, uint256 _deviationToleranceBps) external {
        deployVerbose({
            _thisAggregatorDecimals: USD_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false,
            _marketAggregatorAddress: _marketAggregatorAddress,
            _deviationToleranceBps: _deviationToleranceBps
        });
    }

    function deployUsdWithQuote(
        address _quoteConversionAggregatorAddress,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    ) external {
        deployVerbose({
            _thisAggregatorDecimals: USD_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: false,
            _marketAggregatorAddress: _marketAggregatorAddress,
            _deviationToleranceBps: _deviationToleranceBps
        });
    }

    function deployUsdWithQuoteInverse(
        address _quoteConversionAggregatorAddress,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    ) external {
        deployVerbose({
            _thisAggregatorDecimals: USD_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: true,
            _marketAggregatorAddress: _marketAggregatorAddress,
            _deviationToleranceBps: _deviationToleranceBps
        });
    }

    // PUBLIC FUNCTIONS

    function deployVerbose(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    ) public {
        address instanceAddress = address(
            new PeggedRateDeviationAggregator({
                _thisAggregatorDecimals: _thisAggregatorDecimals,
                _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
                _quoteConversionAggregatorInverted: _quoteConversionAggregatorInverted,
                _marketAggregatorAddress: _marketAggregatorAddress,
                _deviationToleranceBps: _deviationToleranceBps
            })
        );

        emit InstanceDeployed(instanceAddress);
    }
}
