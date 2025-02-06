// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ConvertedQuoteAggregator} from "../ConvertedQuoteAggregator.sol";

/// @title ConvertedQuoteAggregatorFactory Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Factory for ConvertedQuoteAggregator
contract ConvertedQuoteAggregatorFactory {
    event InstanceDeployed(address instanceAddress);

    function deploy(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _sourceAggregatorAddress
    ) external {
        address instanceAddress = address(
            new ConvertedQuoteAggregator(
                _thisAggregatorDecimals,
                _quoteConversionAggregatorAddress,
                _quoteConversionAggregatorInverted,
                _sourceAggregatorAddress
            )
        );

        emit InstanceDeployed(instanceAddress);
    }
}
