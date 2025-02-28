// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ERC4626RateAggregator} from "../ERC4626RateAggregator.sol";

/// @title ERC4626RateAggregatorFactory Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Factory for ERC4626RateAggregator Contract
contract ERC4626RateAggregatorFactory {
    uint8 constant ETH_QUOTE_DECIMALS = 18;
    uint8 constant USD_QUOTE_DECIMALS = 8;

    event InstanceDeployed(address instanceAddress);

    function deployEth(address _erc4626Address) external {
        deployVerbose({
            _thisAggregatorDecimals: ETH_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false,
            _erc4626Address: _erc4626Address
        });
    }

    function deployEthWithQuote(address _erc4626Address, address _quoteConversionAggregatorAddress) external {
        deployVerbose({
            _thisAggregatorDecimals: ETH_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: false,
            _erc4626Address: _erc4626Address
        });
    }

    function deployEthWithQuoteInverse(address _erc4626Address, address _quoteConversionAggregatorAddress) external {
        deployVerbose({
            _thisAggregatorDecimals: ETH_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: true,
            _erc4626Address: _erc4626Address
        });
    }

    function deployUsd(address _erc4626Address) external {
        deployVerbose({
            _thisAggregatorDecimals: USD_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false,
            _erc4626Address: _erc4626Address
        });
    }

    function deployUsdWithQuote(address _erc4626Address, address _quoteConversionAggregatorAddress) external {
        deployVerbose({
            _thisAggregatorDecimals: USD_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: false,
            _erc4626Address: _erc4626Address
        });
    }

    function deployUsdWithQuoteInverse(address _erc4626Address, address _quoteConversionAggregatorAddress) external {
        deployVerbose({
            _thisAggregatorDecimals: USD_QUOTE_DECIMALS,
            _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: true,
            _erc4626Address: _erc4626Address
        });
    }

    // PUBLIC FUNCTIONS

    function deployVerbose(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _erc4626Address
    ) public {
        address instanceAddress = address(
            new ERC4626RateAggregator({
                _thisAggregatorDecimals: _thisAggregatorDecimals,
                _quoteConversionAggregatorAddress: _quoteConversionAggregatorAddress,
                _quoteConversionAggregatorInverted: _quoteConversionAggregatorInverted,
                _erc4626Address: _erc4626Address
            })
        );

        emit InstanceDeployed(instanceAddress);
    }
}
