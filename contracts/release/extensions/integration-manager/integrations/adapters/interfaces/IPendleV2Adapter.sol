// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IPendleV2Market} from "../../../../../../external-interfaces/IPendleV2Market.sol";
import {IPendleV2Router} from "../../../../../../external-interfaces/IPendleV2Router.sol";

/// @title IPendleV2Adapter interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IPendleV2Adapter {
    enum Action {
        BuyPrincipalToken,
        SellPrincipalToken,
        AddLiquidityFromUnderlying,
        RemoveLiquidityToUnderlying,
        RemoveLiquidityToPtAndUnderlying
    }

    struct AddLiquidityFromUnderlyingActionArgs {
        IPendleV2Market market;
        address depositTokenAddress;
        uint256 depositTokenAmount;
        IPendleV2Router.ApproxParams guessPtReceived;
        uint256 minLpAmount;
    }

    struct BuyPrincipalTokenActionArgs {
        IPendleV2Market market;
        address depositTokenAddress;
        uint256 depositTokenAmount;
        IPendleV2Router.ApproxParams guessPtOut;
        uint256 minPtAmount;
    }

    struct RemoveLiquidityToPtAndUnderlyingActionArgs {
        IPendleV2Market market;
        uint256 lpAmount;
        address withdrawalTokenAddress;
        uint256 minWithdrawalTokenAmount;
        uint256 minPtAmount;
    }

    struct RemoveLiquidityToUnderlyingActionArgs {
        IPendleV2Market market;
        address withdrawalTokenAddress;
        uint256 lpAmount;
        uint256 minSyOut;
        uint256 minWithdrawalTokenAmount;
    }

    struct SellPrincipalTokenActionArgs {
        IPendleV2Market market;
        address withdrawalTokenAddress;
        uint256 ptAmount;
        uint256 minWithdrawalTokenAmount;
    }
}
