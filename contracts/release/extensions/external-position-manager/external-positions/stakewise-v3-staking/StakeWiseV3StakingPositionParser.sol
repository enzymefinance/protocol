// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IStakeWiseV3EthVault} from "../../../../../external-interfaces/IStakeWiseV3EthVault.sol";
import {IStakeWiseV3VaultsRegistry} from "../../../../../external-interfaces/IStakeWiseV3VaultsRegistry.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {IStakeWiseV3StakingPosition} from "./IStakeWiseV3StakingPosition.sol";
import {StakeWiseV3StakingPositionDataDecoder} from "./StakeWiseV3StakingPositionDataDecoder.sol";

pragma solidity 0.8.19;

/// @title StakeWiseV3StakingPositionParser
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Parser for StakeWise V3 Staking Positions
contract StakeWiseV3StakingPositionParser is StakeWiseV3StakingPositionDataDecoder, IExternalPositionParser {
    IStakeWiseV3VaultsRegistry public immutable STAKEWISE_V3_VAULT_REGISTRY;
    address public immutable WETH_ADDRESS;

    constructor(address _stakeWiseV3VaultsRegistryAddress, address _wethAddress) {
        STAKEWISE_V3_VAULT_REGISTRY = IStakeWiseV3VaultsRegistry(_stakeWiseV3VaultsRegistryAddress);
        WETH_ADDRESS = _wethAddress;
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
        if (_actionId == uint256(IStakeWiseV3StakingPosition.Actions.Stake)) {
            (IStakeWiseV3EthVault stakeWiseVault, uint256 amount) = __decodeStakeActionArgs(_encodedActionArgs);

            __validateStakeWiseVault(stakeWiseVault);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = WETH_ADDRESS;
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(IStakeWiseV3StakingPosition.Actions.ClaimExitedAssets)) {
            (IStakeWiseV3EthVault stakeWiseVault,,) = __decodeClaimExitedAssetsActionArgs(_encodedActionArgs);

            __validateStakeWiseVault(stakeWiseVault);

            assetsToReceive_ = new address[](1);

            assetsToReceive_[0] = WETH_ADDRESS;
        } else if (_actionId == uint256(IStakeWiseV3StakingPosition.Actions.EnterExitQueue)) {
            (IStakeWiseV3EthVault stakeWiseVault,) = __decodeEnterExitQueueActionArgs(_encodedActionArgs);

            __validateStakeWiseVault(stakeWiseVault);

            assetsToReceive_ = new address[](1);

            assetsToReceive_[0] = WETH_ADDRESS;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @return initArgs_ Parsed and encoded args for ExternalPositionProxy.init()
    function parseInitArgs(address, bytes memory) external pure override returns (bytes memory initArgs_) {
        return "";
    }

    /// @dev Helper to validate a StakeWiseV3 vault contract
    function __validateStakeWiseVault(IStakeWiseV3EthVault _stakeWiseVault) private view {
        require(
            STAKEWISE_V3_VAULT_REGISTRY.vaults({_vault: address(_stakeWiseVault)}),
            "__validateStakeWiseVault: Invalid StakeWise vault contract"
        );
    }
}
