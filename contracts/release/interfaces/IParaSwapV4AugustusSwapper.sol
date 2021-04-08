// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ParaSwap V4 IAugustusSwapper interface
interface IParaSwapV4AugustusSwapper {
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

    struct SellData {
        address fromToken;
        uint256 fromAmount;
        uint256 toAmount;
        uint256 expectedAmount;
        address payable beneficiary;
        string referrer;
        bool useReduxToken;
        Path[] path;
    }

    function multiSwap(SellData calldata) external payable returns (uint256);
}
