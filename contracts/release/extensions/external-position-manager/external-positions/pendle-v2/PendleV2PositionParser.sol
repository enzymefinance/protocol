// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {IPendleV2Position} from "./IPendleV2Position.sol";
import {PendleV2PositionDataDecoder} from "./PendleV2PositionDataDecoder.sol";

pragma solidity 0.8.19;

/// @title PendleV2PositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Pendle V2 Positions
contract PendleV2PositionParser is PendleV2PositionDataDecoder, IExternalPositionParser {
    address private constant NATIVE_ASSET_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address private immutable WRAPPED_NATIVE_ASSET_ADDRESS;

    constructor(address _wrappedNativeAssetAddress) {
        WRAPPED_NATIVE_ASSET_ADDRESS = _wrappedNativeAssetAddress;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        view
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(IPendleV2Position.Actions.BuyPrincipalToken)) {
            (,,, address depositTokenAddress, uint256 depositAmount,,) =
                __decodeBuyPrincipalTokenActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = __parseTokenAddressInput(depositTokenAddress);
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = depositAmount;
        } else if (_actionId == uint256(IPendleV2Position.Actions.SellPrincipalToken)) {
            (,, address withdrawalTokenAddress,,) = __decodeSellPrincipalTokenActionArgs(_encodedActionArgs);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = __parseTokenAddressInput(withdrawalTokenAddress);
        } else if (_actionId == uint256(IPendleV2Position.Actions.AddLiquidity)) {
            (,, address depositTokenAddress, uint256 depositAmount,,) =
                __decodeAddLiquidityActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = __parseTokenAddressInput(depositTokenAddress);
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = depositAmount;
        } else if (_actionId == uint256(IPendleV2Position.Actions.RemoveLiquidity)) {
            (, address withdrawalTokenAddress,,,) = __decodeRemoveLiquidityActionArgs(_encodedActionArgs);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = __parseTokenAddressInput(withdrawalTokenAddress);
        } else if (_actionId == uint256(IPendleV2Position.Actions.ClaimRewards)) {
            // No validations or transferred assets passed for Actions.ClaimRewards
        } else {
            revert("parseAssetsForAction: Unrecognized action");
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @dev Helper to parse the native asset address into the wrapped asset as needed
    function __parseTokenAddressInput(address _tokenAddress) private view returns (address parsedTokenAddress_) {
        return NATIVE_ASSET_ADDRESS == _tokenAddress ? WRAPPED_NATIVE_ASSET_ADDRESS : _tokenAddress;
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    function parseInitArgs(address, bytes memory) external pure override returns (bytes memory) {
        return "";
    }
}
