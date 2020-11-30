// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
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
