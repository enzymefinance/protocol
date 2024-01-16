// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IParaSwapV5Adapter interface
/// @author Enzyme Council <security@enzyme.finance>
interface IParaSwapV5Adapter {
    struct SimpleSwapParams {
        address incomingAsset;
        address[] callees;
        bytes exchangeData;
        uint256[] startIndexes;
        uint256[] values;
    }

    enum SwapType {
        Simple,
        Multi,
        Mega
    }
}
