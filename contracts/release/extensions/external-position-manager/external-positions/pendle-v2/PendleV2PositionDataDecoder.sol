// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IPendleV2Market} from "../../../../../external-interfaces/IPendleV2Market.sol";
import {IPendleV2PrincipalToken} from "../../../../../external-interfaces/IPendleV2PrincipalToken.sol";
import {IPendleV2Router} from "../../../../../external-interfaces/IPendleV2Router.sol";

/// @title PendleV2PositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for IPendleV2Position payloads
abstract contract PendleV2PositionDataDecoder {
    /// @dev Helper to decode args used during the BuyPrincipalToken action
    function __decodeBuyPrincipalTokenActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address principalTokenAddress_,
            IPendleV2Market market_,
            uint32 pricingDuration_,
            address depositTokenAddress_,
            uint256 depositAmount_,
            IPendleV2Router.ApproxParams memory guessPtOut_,
            uint256 minPtOut_
        )
    {
        return abi.decode(
            _actionArgs, (address, IPendleV2Market, uint32, address, uint256, IPendleV2Router.ApproxParams, uint256)
        );
    }

    /// @dev Helper to decode args used during the SellPrincipalToken action
    function __decodeSellPrincipalTokenActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            IPendleV2PrincipalToken principalTokenAddress_,
            IPendleV2Market market_,
            address withdrawalTokenAddress_,
            uint256 withdrawalAmount_,
            uint256 minIncomingAmount_
        )
    {
        return abi.decode(_actionArgs, (IPendleV2PrincipalToken, IPendleV2Market, address, uint256, uint256));
    }

    /// @dev Helper to decode args used during the AddLiquidity action
    function __decodeAddLiquidityActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            IPendleV2Market market_,
            uint32 pricingDuration_,
            address depositTokenAddress_,
            uint256 depositAmount_,
            IPendleV2Router.ApproxParams memory guessPtReceived_,
            uint256 minLpOut_
        )
    {
        return
            abi.decode(_actionArgs, (IPendleV2Market, uint32, address, uint256, IPendleV2Router.ApproxParams, uint256));
    }

    /// @dev Helper to decode args used during the AddLiquidity action
    function __decodeRemoveLiquidityActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            IPendleV2Market market_,
            address withdrawalToken_,
            uint256 withdrawalAmount_,
            uint256 minSyOut_,
            uint256 minIncomingAmount_
        )
    {
        return abi.decode(_actionArgs, (IPendleV2Market, address, uint256, uint256, uint256));
    }

    /// @dev Helper to decode args used during the ClaimRewards action
    function __decodeClaimRewardsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory marketAddresses_)
    {
        return abi.decode(_actionArgs, (address[]));
    }
}
