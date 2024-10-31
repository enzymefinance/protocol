// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.8.0 <0.9.0;

import {IGMXV2Order} from "./IGMXV2Order.sol";
import {IGMXV2OrderHandler} from "./IGMXV2OrderHandler.sol";

/// @title IGMXV2ExchangeRouter Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IGMXV2ExchangeRouter {
    struct CreateOrderParams {
        CreateOrderParamsAddresses addresses;
        CreateOrderParamsNumbers numbers;
        IGMXV2Order.OrderType orderType;
        IGMXV2Order.DecreasePositionSwapType decreasePositionSwapType;
        bool isLong;
        bool shouldUnwrapNativeToken;
        bool autoCancel;
        bytes32 referralCode;
    }

    struct CreateOrderParamsAddresses {
        address receiver;
        address cancellationReceiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialCollateralToken;
        address[] swapPath;
    }

    struct CreateOrderParamsNumbers {
        uint256 sizeDeltaUsd;
        uint256 initialCollateralDeltaAmount;
        uint256 triggerPrice;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 minOutputAmount;
        uint256 validFromTime;
    }

    function createOrder(CreateOrderParams calldata _params) external payable returns (bytes32 key_);

    function updateOrder(
        bytes32 _key,
        uint256 _sizeDeltaUsd,
        uint256 _acceptablePrice,
        uint256 _triggerPrice,
        uint256 _minOutputAmount,
        uint256 _validFromTime,
        bool _autoCancel
    ) external payable;

    function cancelOrder(bytes32 _key) external payable;

    function claimFundingFees(address[] memory _markets, address[] memory _tokens, address _receiver)
        external
        payable
        returns (uint256[] memory claimedAmounts_);

    function claimCollateral(
        address[] memory _markets,
        address[] memory _tokens,
        uint256[] memory _timeKeys,
        address _receiver
    ) external payable returns (uint256[] memory claimedAmounts_);

    function orderHandler() external view returns (IGMXV2OrderHandler orderHandler_);

    function setSavedCallbackContract(address _market, address _callbackContract) external payable;
}
