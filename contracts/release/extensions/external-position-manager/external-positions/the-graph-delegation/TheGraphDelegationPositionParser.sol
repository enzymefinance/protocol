// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPositionParser} from "../IExternalPositionParser.sol";
import {TheGraphDelegationPositionDataDecoder} from "./TheGraphDelegationPositionDataDecoder.sol";
import {ITheGraphDelegationPosition} from "./ITheGraphDelegationPosition.sol";

pragma solidity 0.6.12;

/// @title TheGraphDelegationPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for The Graph Delegation positions
contract TheGraphDelegationPositionParser is IExternalPositionParser, TheGraphDelegationPositionDataDecoder {
    address private immutable GRT_TOKEN;

    constructor(address _grtToken) public {
        GRT_TOKEN = _grtToken;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(ITheGraphDelegationPosition.Actions.Delegate)) {
            (, uint256 amount) = __decodeDelegateActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = GRT_TOKEN;

            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else {
            // Action.Undelegate and Action.Withdraw
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = GRT_TOKEN;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
