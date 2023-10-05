// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPositionParser} from "../IExternalPositionParser.sol";
import {ConvexVotingPositionDataDecoder} from "./ConvexVotingPositionDataDecoder.sol";
import {IConvexVotingPosition} from "./IConvexVotingPosition.sol";

pragma solidity 0.6.12;

/// @title ConvexVotingPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Convex vlCVX positions
contract ConvexVotingPositionParser is IExternalPositionParser, ConvexVotingPositionDataDecoder {
    address private immutable CVX_TOKEN;

    constructor(address _cvxToken) public {
        CVX_TOKEN = _cvxToken;
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
        if (_actionId == uint256(IConvexVotingPosition.Actions.Lock)) {
            (uint256 amount,) = __decodeLockActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = CVX_TOKEN;

            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(IConvexVotingPosition.Actions.Withdraw)) {
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = CVX_TOKEN;
        }

        // No validations or transferred assets passed for Actions.ClaimRewards

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
