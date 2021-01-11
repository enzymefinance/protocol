// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ParaSwap IAugustusSwapper interface
interface IParaSwapAugustusSwapper {
    struct Route {
        address payable exchange;
        address targetExchange;
        uint256 percent;
        bytes payload;
        uint256 networkFee;
    }

    struct Path {
        address to;
        uint256 totalNetworkFee;
        Route[] routes;
    }

    function multiSwap(
        address,
        address,
        uint256,
        uint256,
        uint256,
        Path[] calldata,
        uint256,
        address payable,
        uint256,
        string calldata
    ) external payable returns (uint256);
}
