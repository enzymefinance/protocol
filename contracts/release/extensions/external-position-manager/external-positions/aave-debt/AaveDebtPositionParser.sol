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
    /// @param _externalPosition The _externalPosition to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address _externalPosition,
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
            // No need to validate aTokens, as the worst case would be that this function is used
            // to indirectly add and track a misc supported asset
            (assetsToTransfer_, amountsToTransfer_) = __decodeAddCollateralActionArgs(
                _encodedActionArgs
            );
            __validateSupportedAssets(assetsToTransfer_);
        } else if (_actionId == uint256(IAaveDebtPosition.Actions.Borrow)) {
            // No need to validate tokens, as `borrow()` call to Aave will fail for invalid tokens,
            // and even if Aave logic changes to fail silently, the worst case would be that
            // this function is used to indirectly add and track a misc supported asset
            (assetsToReceive_, ) = __decodeBorrowActionArgs(_encodedActionArgs);
            __validateSupportedAssets(assetsToReceive_);
        } else if (_actionId == uint256(IAaveDebtPosition.Actions.RemoveCollateral)) {
            // Lib validates that each is a valid collateral asset
            (assetsToReceive_, ) = __decodeRemoveCollateralActionArgs(_encodedActionArgs);
        } else if (_actionId == uint256(IAaveDebtPosition.Actions.RepayBorrow)) {
            // Lib validates that each is a valid borrowed asset
            (assetsToTransfer_, amountsToTransfer_) = __decodeRepayBorrowActionArgs(
                _encodedActionArgs
            );

            for (uint256 i; i < assetsToTransfer_.length; i++) {
                if (amountsToTransfer_[i] == type(uint256).max) {
                    // Transfers the full repay amount to the external position,
                    // which will still call `repay()` on the lending pool with max uint.
                    // This is fine, because `repay()` only uses up to the full repay amount.
                    address debtToken = IAaveDebtPosition(_externalPosition)
                        .getDebtTokenForBorrowedAsset(assetsToTransfer_[i]);
                    amountsToTransfer_[i] = ERC20(debtToken).balanceOf(_externalPosition);
                }
            }
        }

        // No validations or transferred assets passed for Actions.ClaimRewards

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}

    /// @dev Helper to validate that assets are supported within the protocol
    function __validateSupportedAssets(address[] memory _assets) private view {
        for (uint256 i; i < _assets.length; i++) {
            require(
                IValueInterpreter(VALUE_INTERPRETER).isSupportedAsset(_assets[i]),
                "__validateSupportedAssets: Unsupported asset"
            );
        }
    }
}
