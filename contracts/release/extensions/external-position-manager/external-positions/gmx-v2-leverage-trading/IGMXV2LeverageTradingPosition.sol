// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IGMXV2Order} from "../../../../../external-interfaces/IGMXV2Order.sol";
import {IExternalPosition} from "../../IExternalPosition.sol";

import {GMXV2LeverageTradingPositionLibBase1} from "./bases/GMXV2LeverageTradingPositionLibBase1.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IGMXV2LeverageTradingPosition Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IGMXV2LeverageTradingPosition is IExternalPosition {
    enum Actions {
        CreateOrder,
        UpdateOrder,
        CancelOrder,
        ClaimFundingFees,
        ClaimCollateral,
        Sweep
    }

    struct CreateOrderParamsAddresses {
        address market;
        address initialCollateralToken;
    }

    struct CreateOrderParamsNumbers {
        uint256 sizeDeltaUsd;
        uint256 initialCollateralDeltaAmount;
        uint256 triggerPrice;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 minOutputAmount;
        uint256 validFromTime;
    }

    struct CreateOrderActionArgs {
        CreateOrderParamsAddresses addresses;
        CreateOrderParamsNumbers numbers;
        IGMXV2Order.OrderType orderType;
        IGMXV2Order.DecreasePositionSwapType decreasePositionSwapType;
        bool isLong;
        address exchangeRouter;
        bool autoCancel;
    }

    struct UpdateOrderActionArgs {
        bytes32 key;
        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        uint256 triggerPrice;
        uint256 minOutputAmount;
        uint256 validFromTime;
        bool autoCancel;
        uint256 executionFeeIncrease;
        address exchangeRouter;
    }

    struct CancelOrderActionArgs {
        bytes32 key;
        address exchangeRouter;
    }

    struct ClaimFundingFeesActionArgs {
        address[] markets;
        address[] tokens;
        address exchangeRouter;
    }

    struct ClaimCollateralActionArgs {
        address[] markets;
        address[] tokens;
        uint256[] timeKeys;
        address exchangeRouter;
    }

    function getClaimableCollateralKeys() external view returns (bytes32[] memory claimableCollateralKeys_);

    function getClaimableCollateralKeyToClaimableCollateralInfo(bytes32 _claimableCollateralKey)
        external
        view
        returns (GMXV2LeverageTradingPositionLibBase1.ClaimableCollateralInfo memory info_);

    function getMarketToIsCallbackContractSet(address _market) external view returns (bool isCallbackContractSet_);

    function getTrackedAssets() external view returns (address[] memory trackedAssets_);

    function getTrackedMarkets() external view returns (address[] memory trackedMarkets_);
}
