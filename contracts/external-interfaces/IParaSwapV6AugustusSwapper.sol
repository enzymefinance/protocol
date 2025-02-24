// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ParaSwap V6 IAugustusSwapper interface
interface IParaSwapV6AugustusSwapper {
    struct GenericData {
        address srcToken;
        address destToken;
        uint256 fromAmount;
        uint256 toAmount;
        uint256 quotedAmount;
        bytes32 metadata;
        address payable beneficiary;
    }

    function swapExactAmountIn(
        address _executor,
        GenericData calldata _swapData,
        uint256 _partnerAndFee,
        bytes calldata _permit,
        bytes calldata _executorData
    ) external payable returns (uint256 receivedAmount_, uint256 paraswapShare_, uint256 partnerShare_);

    function swapExactAmountOut(
        address _executor,
        GenericData calldata _swapData,
        uint256 _partnerAndFee,
        bytes calldata _permit,
        bytes calldata _executorData
    )
        external
        payable
        returns (uint256 spentAmount_, uint256 receivedAmount_, uint256 paraswapShare_, uint256 partnerShare_);
}
