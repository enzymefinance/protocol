// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IStakeWiseV3EthVault} from "../../../../../external-interfaces/IStakeWiseV3EthVault.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {StakeWiseV3StakingPositionLibBase1} from "./bases/StakeWiseV3StakingPositionLibBase1.sol";
import {IStakeWiseV3StakingPosition} from "./IStakeWiseV3StakingPosition.sol";
import {StakeWiseV3StakingPositionDataDecoder} from "./StakeWiseV3StakingPositionDataDecoder.sol";

/// @title StakeWiseV3StakingPositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for StakeWiseV3 Staking Positions
contract StakeWiseV3StakingPositionLib is
    IStakeWiseV3StakingPosition,
    StakeWiseV3StakingPositionDataDecoder,
    StakeWiseV3StakingPositionLibBase1
{
    using AddressArrayLib for address[];

    IWETH public immutable WETH_TOKEN;
    address private immutable REFERRER_ADDRESS;
    IAddressListRegistry public immutable ADDRESS_LIST_REGISTRY;
    uint256 public immutable SUPPORTED_IMPLEMENTATIONS_LIST_ID;

    constructor(
        address _wethToken,
        address _referrer,
        IAddressListRegistry _addressListRegistry,
        uint256 _supportedImplementationsListID
    ) {
        WETH_TOKEN = IWETH(_wethToken);
        REFERRER_ADDRESS = _referrer;
        ADDRESS_LIST_REGISTRY = _addressListRegistry;
        SUPPORTED_IMPLEMENTATIONS_LIST_ID = _supportedImplementationsListID;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.Stake)) {
            __stake(actionArgs);
        } else if (actionId == uint256(Actions.Redeem)) {
            revert("receiveCallFromVault: Redeem is a legacy method that is now unsupported");
        } else if (actionId == uint256(Actions.EnterExitQueue)) {
            __enterExitQueue(actionArgs);
        } else if (actionId == uint256(Actions.ClaimExitedAssets)) {
            __claimExitedAssets(actionArgs);
        }
    }

    /// @dev Stakes ETH to StakeWiseV3 deposit contract
    function __stake(bytes memory _actionArgs) private {
        (IStakeWiseV3EthVault stakeWiseVault, uint256 assetAmount) = __decodeStakeActionArgs(_actionArgs);

        __validateStakeWiseVault(stakeWiseVault);

        WETH_TOKEN.withdraw(assetAmount);

        IStakeWiseV3EthVault(stakeWiseVault).deposit{value: assetAmount}({
            _receiver: address(this),
            _referrer: REFERRER_ADDRESS
        });

        if (!stakeWiseVaultTokens.storageArrayContains(address(stakeWiseVault))) {
            stakeWiseVaultTokens.push(address(stakeWiseVault));

            emit VaultTokenAdded(address(stakeWiseVault));
        }
    }

    /// @dev Locks shares to the exit queue.
    function __enterExitQueue(bytes memory _actionArgs) private {
        (IStakeWiseV3EthVault stakeWiseVault, uint256 sharesAmount) = __decodeEnterExitQueueActionArgs(_actionArgs);

        __validateStakeWiseVault(stakeWiseVault);

        uint256 positionTicket = stakeWiseVault.enterExitQueue({_shares: sharesAmount, _receiver: address(this)});

        // If the positionTicket is type(uint256).max, it means that the shares were redeemed directly
        if (positionTicket == type(uint256).max) {
            // Transfer the ETH balance to the vaultProxy
            Address.sendValue(payable(msg.sender), address(this).balance);
        } else {
            // Add ExitRequest to storage
            exitRequests.push(
                ExitRequest({
                    stakeWiseVaultAddress: address(stakeWiseVault),
                    positionTicket: positionTicket,
                    timestamp: block.timestamp,
                    sharesAmount: sharesAmount
                })
            );

            emit ExitRequestAdded(address(stakeWiseVault), positionTicket, block.timestamp, sharesAmount);
        }

        // Remove StakeWiseVaultToken from storage if exited in full
        __removeStakeWiseVaultTokenIfNoBalance(stakeWiseVault);
    }

    /// @dev Claims assets that were exited.
    function __claimExitedAssets(bytes memory _actionArgs) private {
        (IStakeWiseV3EthVault stakeWiseVault, uint256 positionTicket, uint256 timestamp) =
            __decodeClaimExitedAssetsActionArgs(_actionArgs);

        __validateStakeWiseVault(stakeWiseVault);

        int256 exitQueueIndex = stakeWiseVault.getExitQueueIndex({_positionTicket: positionTicket});
        require(exitQueueIndex >= 0, "__claimExitedAssets: positionTicket is not in exit queue");

        // Since V2, claimExitedAssets does not provide a return value, we have to call the following manually to get the tickets left
        (uint256 leftTickets, uint256 exitedTickets,) = stakeWiseVault.calculateExitedAssets({
            _receiver: address(this),
            _positionTicket: positionTicket,
            _timestamp: timestamp,
            _exitQueueIndex: uint256(exitQueueIndex)
        });

        // Claim the position ticket
        stakeWiseVault.claimExitedAssets({
            _positionTicket: positionTicket,
            _timestamp: timestamp,
            _exitQueueIndex: uint256(exitQueueIndex)
        });

        // Update or remove the ExitRequest
        uint256 finalExitRequestsIndex = exitRequests.length - 1;
        for (uint256 i; i <= finalExitRequestsIndex; i++) {
            ExitRequest storage exitRequest = exitRequests[i];

            if (
                exitRequest.stakeWiseVaultAddress == address(stakeWiseVault)
                    && exitRequest.positionTicket == positionTicket
            ) {
                // Replicating StakeWise's internal logic. Updating the position if there are still tickets left (leaving one for rounding error)
                if (leftTickets > 1) {
                    uint256 nextPositionTicket = positionTicket + exitedTickets;
                    // If the claim was only partial, update the ExitRequest
                    exitRequest.positionTicket = nextPositionTicket;
                    exitRequest.sharesAmount = leftTickets;

                    // New requests added in the context of a partial claim keep the original timestamp
                    emit ExitRequestAdded(address(stakeWiseVault), nextPositionTicket, timestamp, leftTickets);
                } else {
                    // If the claim was in full, remove the ExitRequest from exitRequests
                    if (i != finalExitRequestsIndex) {
                        exitRequests[i] = exitRequests[finalExitRequestsIndex];
                    }
                    exitRequests.pop();
                }

                emit ExitRequestRemoved(address(stakeWiseVault), positionTicket);

                break;
            }
        }

        // Transfer the ETH balance to the vaultProxy
        Address.sendValue(payable(msg.sender), address(this).balance);
    }

    /// @dev Helper to remove a stakeWiseVaultToken from storage and emit the corresponding event if balance is 0
    function __removeStakeWiseVaultTokenIfNoBalance(IStakeWiseV3EthVault _stakeWiseVault) private {
        if (_stakeWiseVault.getShares(address(this)) == 0) {
            stakeWiseVaultTokens.removeStorageItem(address(_stakeWiseVault));
            emit VaultTokenRemoved(address(_stakeWiseVault));
        }
    }

    /// @dev Helper to validate that a StakeWise implementation belongs to the allowed lists
    function __validateStakeWiseVault(IStakeWiseV3EthVault _stakeWiseVault) private view {
        require(
            ADDRESS_LIST_REGISTRY.isInList({
                _id: SUPPORTED_IMPLEMENTATIONS_LIST_ID,
                _item: _stakeWiseVault.implementation()
            }),
            "__validateStakeWiseVault: Unregistered implementation"
        );
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev Reverts if any position (stakeWiseVaultTokens or pending exit requests) belong to an unsupported StakeWise vault implementation
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        // If no stakeWiseVaultToken is held and no exitRequests are pending, return empty arrays.
        uint256 stakeWiseVaultTokensLength = stakeWiseVaultTokens.length;
        uint256 exitRequestsLength = exitRequests.length;

        if (stakeWiseVaultTokensLength == 0 && exitRequestsLength == 0) {
            return (assets_, amounts_);
        }

        assets_ = new address[](1);
        amounts_ = new uint256[](1);

        assets_[0] = address(WETH_TOKEN);

        // stakeWiseVaultTokens held by the EP
        for (uint256 i; i < stakeWiseVaultTokensLength; i++) {
            IStakeWiseV3EthVault stakeWiseVault = IStakeWiseV3EthVault(stakeWiseVaultTokens[i]);

            __validateStakeWiseVault(stakeWiseVault);

            amounts_[0] += stakeWiseVault.convertToAssets({_shares: stakeWiseVault.getShares(address(this))});
        }

        // Pending exit requests
        for (uint256 i; i < exitRequestsLength; i++) {
            ExitRequest memory exitRequest = exitRequests[i];

            IStakeWiseV3EthVault stakeWiseVault = IStakeWiseV3EthVault(exitRequest.stakeWiseVaultAddress);

            __validateStakeWiseVault(stakeWiseVault);

            // If the positionTicket is invalid or already claimed, the exit queue index will be -1
            int256 exitQueueIndex = stakeWiseVault.getExitQueueIndex({_positionTicket: exitRequest.positionTicket});

            // A missing positionTicket means that the VaultState has not been updated.
            // In this case, we fallback to valuing the exitRequest based on the sharePrice
            if (exitQueueIndex < 0) {
                amounts_[0] += stakeWiseVault.convertToAssets({_shares: exitRequest.sharesAmount});
                continue;
            }

            (,, uint256 claimedAssets) = stakeWiseVault.calculateExitedAssets({
                _receiver: address(this),
                _positionTicket: exitRequest.positionTicket,
                _timestamp: exitRequest.timestamp,
                _exitQueueIndex: uint256(exitQueueIndex)
            });

            amounts_[0] += claimedAssets;
        }

        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the exitRequests var
    /// @return exitRequests_ The stakeWise exit requests
    function getExitRequests() public view returns (ExitRequest[] memory exitRequests_) {
        return exitRequests;
    }

    /// @notice Gets the stakeWiseVaultTokens var
    /// @return stakeWiseVaultTokens_ The stakeWiseVaultTokens var
    function getStakeWiseVaultTokens() public view returns (address[] memory stakeWiseVaultTokens_) {
        return stakeWiseVaultTokens;
    }
}
