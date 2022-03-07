// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "../IExternalPositionParser.sol";
import "./AaveDebtPositionDataDecoder.sol";
import "./IAaveDebtPosition.sol";

pragma solidity 0.6.12;

/// @title AaveDebtPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Aave Debt Positions
contract AaveDebtPositionParser is IExternalPositionParser, AaveDebtPositionDataDecoder {
    address private immutable VALUE_INTERPRETER;

    constructor(address _valueInterpreter) public {
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address,
        uint256 _actionId,
        bytes memory _encodedActionArgs
    )
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(IAaveDebtPosition.Actions.AddCollateral)) {
            // No need to validate aTokens, as the worst using a malicious aToken can do is track
            // invalid collateral in the external position
            (assetsToTransfer_, amountsToTransfer_) = __decodeAddCollateralActionArgs(
                _encodedActionArgs
            );
        } else if (_actionId == uint256(IAaveDebtPosition.Actions.Borrow)) {
            // No need to validate tokens, as `borrow()` call to Aave will fail for invalid tokens,
            // and even if Aave logic changes to fail silently, the worst case would be that
            // this function is used to indirectly add and track a misc asset in the vault
            (assetsToReceive_, ) = __decodeBorrowActionArgs(_encodedActionArgs);
            for (uint256 i; i < assetsToReceive_.length; i++) {
                require(
                    IValueInterpreter(VALUE_INTERPRETER).isSupportedAsset(assetsToReceive_[i]),
                    "parseAssetsForAction: Unsupported asset"
                );
            }
        } else if (_actionId == uint256(IAaveDebtPosition.Actions.RemoveCollateral)) {
            // Lib validates that each is a valid collateral asset
            (assetsToReceive_, ) = __decodeRemoveCollateralActionArgs(_encodedActionArgs);
        } else if (_actionId == uint256(IAaveDebtPosition.Actions.RepayBorrow)) {
            // Lib validates that each is a valid borrowed asset
            (assetsToTransfer_, amountsToTransfer_) = __decodeRepayBorrowActionArgs(
                _encodedActionArgs
            );
        }

        // No validations or transferred assets passed for Actions.ClaimRewards

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
