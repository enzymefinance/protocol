// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestSynthetixExchanger Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestSynthetixExchanger {
    function getAmountsForExchange(
        uint256 _sourceAmount,
        bytes32 _sourceCurrencyKey,
        bytes32 _destinationCurrencyKey
    )
        external
        view
        returns (
            uint256 amountReceived_,
            uint256 fee_,
            uint256 exchangeRate_
        );
}
