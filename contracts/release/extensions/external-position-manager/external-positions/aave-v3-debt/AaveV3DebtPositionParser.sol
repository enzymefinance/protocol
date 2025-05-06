// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IAaveAToken} from "../../../../../external-interfaces/IAaveAToken.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {AddOnlyAddressListOwnerConsumerMixin} from
    "../../../../../persistent/address-list-registry/address-list-owners/utils/0.8.19/AddOnlyAddressListOwnerConsumerMixin.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {AaveV3DebtPositionDataDecoder} from "./AaveV3DebtPositionDataDecoder.sol";
import {IAaveV3DebtPosition} from "./IAaveV3DebtPosition.sol";

pragma solidity 0.8.19;

/// @title AaveV3DebtPositionParser
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Parser for Aave Debt Positions
contract AaveV3DebtPositionParser is
    IExternalPositionParser,
    AaveV3DebtPositionDataDecoder,
    AddOnlyAddressListOwnerConsumerMixin
{
    constructor(address _addressListRegistry, uint256 _aTokenListId)
        AddOnlyAddressListOwnerConsumerMixin(_addressListRegistry, _aTokenListId)
    {}

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPosition The _externalPosition to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address _externalPosition, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(IAaveV3DebtPosition.Actions.AddCollateral)) {
            bool fromUnderlying;
            (assetsToTransfer_, amountsToTransfer_, fromUnderlying) =
                __decodeAddCollateralActionArgs(_encodedActionArgs);

            for (uint256 i; i < assetsToTransfer_.length; i++) {
                // Initially the assetsToTransfer_ are the aTokens
                __validateAndAddListItemIfUnregistered(assetsToTransfer_[i]);

                if (fromUnderlying) {
                    assetsToTransfer_[i] = IAaveAToken(assetsToTransfer_[i]).UNDERLYING_ASSET_ADDRESS();
                }
            }
        } else if (_actionId == uint256(IAaveV3DebtPosition.Actions.Borrow)) {
            // No need to validate tokens, as `borrow()` call to Aave will fail for invalid tokens,
            // and even if Aave logic changes to fail silently, the worst case would be that
            // this function is used to indirectly add and track a misc asset
            (assetsToReceive_,) = __decodeBorrowActionArgs(_encodedActionArgs);
        } else if (_actionId == uint256(IAaveV3DebtPosition.Actions.RemoveCollateral)) {
            bool toUnderlying;
            // Lib validates that each is a valid collateral asset
            (assetsToReceive_,, toUnderlying) = __decodeRemoveCollateralActionArgs(_encodedActionArgs);

            if (toUnderlying) {
                for (uint256 i; i < assetsToReceive_.length; i++) {
                    assetsToReceive_[i] = IAaveAToken(assetsToReceive_[i]).UNDERLYING_ASSET_ADDRESS();
                }
            }
        } else if (_actionId == uint256(IAaveV3DebtPosition.Actions.RepayBorrow)) {
            // Lib validates that each is a valid borrowed asset
            (assetsToTransfer_, amountsToTransfer_) = __decodeRepayBorrowActionArgs(_encodedActionArgs);

            for (uint256 i; i < assetsToTransfer_.length; i++) {
                if (amountsToTransfer_[i] == type(uint256).max) {
                    // Transfers the full repay amount to the external position,
                    // which will still call `repay()` on the lending pool with max uint.
                    // This is fine, because `repay()` only uses up to the full repay amount.
                    address debtToken =
                        IAaveV3DebtPosition(_externalPosition).getDebtTokenForBorrowedAsset(assetsToTransfer_[i]);
                    amountsToTransfer_[i] = IERC20(debtToken).balanceOf(_externalPosition);
                }
            }
        } else if (_actionId == uint256(IAaveV3DebtPosition.Actions.ClaimRewards)) {
            (,, address rewardToken) = __decodeClaimRewardsActionArgs(_encodedActionArgs);
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = rewardToken;
        } else if (_actionId == uint256(IAaveV3DebtPosition.Actions.ClaimMerklRewards)) {
            (assetsToReceive_,,) = __decodeClaimMerklRewardsActionArgs(_encodedActionArgs);
        }

        // No validations or transferred assets passed for Actions.SetEMode, Actions.SetUseReserveAsCollateral, and Actions.Sweep
        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
