// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2Router Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IPendleV2Router {
    struct ApproxParams {
        uint256 guessMin;
        uint256 guessMax;
        uint256 guessOffchain;
        uint256 maxIteration;
        uint256 eps;
    }

    struct FillOrderParams {
        Order order;
        bytes signature;
        uint256 makingAmount;
    }

    struct LimitOrderData {
        address limitRouter;
        uint256 epsSkipMarket;
        FillOrderParams[] normalFills;
        FillOrderParams[] flashFills;
        bytes optData;
    }

    struct Order {
        uint256 salt;
        uint256 expiry;
        uint256 nonce;
        OrderType orderType;
        address token;
        address YT;
        address maker;
        address receiver;
        uint256 makingAmount;
        uint256 lnImpliedRate;
        uint256 failSafeRate;
        bytes permit;
    }

    enum OrderType {
        SY_FOR_PT,
        PT_FOR_SY,
        SY_FOR_YT,
        YT_FOR_SY
    }

    function addLiquiditySingleSy(
        address _receiver,
        address _market,
        uint256 _netSyIn,
        uint256 _minLpOut,
        ApproxParams calldata _guessPtReceivedFromSy,
        LimitOrderData calldata _limit
    ) external returns (uint256 netLpOut_, uint256 netSyFee_);

    function removeLiquidityDualSyAndPt(
        address _receiver,
        address _market,
        uint256 _netLpToRemove,
        uint256 _minSyOut,
        uint256 _minPtOut
    ) external returns (uint256 netSyOut_, uint256 netPtOut_);

    function removeLiquiditySingleSy(
        address _receiver,
        address _market,
        uint256 _netLpToRemove,
        uint256 _minSyOut,
        LimitOrderData calldata _limit
    ) external returns (uint256 netSyOut_, uint256 netSyFee_);

    function swapExactSyForPt(
        address _receiver,
        address _market,
        uint256 _exactSyIn,
        uint256 _minPtOut,
        ApproxParams calldata _guessPtOut,
        LimitOrderData calldata _limit
    ) external returns (uint256 netPtOut_, uint256 netSyFee_);

    function swapExactPtForSy(
        address _receiver,
        address _market,
        uint256 _exactPtIn,
        uint256 _minSyOut,
        LimitOrderData calldata _limit
    ) external returns (uint256 netSyOut_, uint256 netSyFee_);

    function redeemPyToSy(address _receiver, address _YT, uint256 _netPyIn, uint256 _minSyOut)
        external
        returns (uint256 netSyOut_);
}
