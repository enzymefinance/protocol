// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {IKilnStakingPosition} from "./IKilnStakingPosition.sol";
import {KilnStakingPositionDataDecoder} from "./KilnStakingPositionDataDecoder.sol";

pragma solidity 0.8.19;

/// @title KilnStakingPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Kiln Staking Positions
contract KilnStakingPositionParser is KilnStakingPositionDataDecoder, IExternalPositionParser {
    uint256 public constant ETH_AMOUNT_PER_NODE = 32 ether;

    IAddressListRegistry public immutable ADDRESS_LIST_REGISTRY_CONTRACT;
    uint256 public immutable STAKING_CONTRACTS_LIST_ID;
    address public immutable WETH_TOKEN;

    constructor(address _addressListRegistry, uint256 _stakingContractsListId, address _weth) {
        ADDRESS_LIST_REGISTRY_CONTRACT = IAddressListRegistry(_addressListRegistry);
        STAKING_CONTRACTS_LIST_ID = _stakingContractsListId;
        WETH_TOKEN = _weth;
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
        if (_actionId == uint256(IKilnStakingPosition.Actions.Stake)) {
            (address stakingContractAddress, uint256 validatorAmount) = __decodeStakeActionArgs(_encodedActionArgs);

            __validateStakingContract(stakingContractAddress);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = WETH_TOKEN;
            amountsToTransfer_[0] = validatorAmount * ETH_AMOUNT_PER_NODE;
        } else if (_actionId == uint256(IKilnStakingPosition.Actions.ClaimFees)) {
            (address stakingContractAddress,,) = __decodeClaimFeesAction(_encodedActionArgs);

            __validateStakingContract(stakingContractAddress);

            // The StakingContract implementation no longer allows 3rd parties to claim fees on behalf of arbitrary users,
            // so no further validation is needed here.

            assetsToReceive_ = new address[](1);

            assetsToReceive_[0] = WETH_TOKEN;
        } else if (_actionId == uint256(IKilnStakingPosition.Actions.Unstake)) {
            (address stakingContractAddress,) = __decodeUnstakeActionArgs(_encodedActionArgs);

            __validateStakingContract(stakingContractAddress);

            // No ETH is received atomically, as this action simply joins the exit queue
        } else if (_actionId == uint256(IKilnStakingPosition.Actions.SweepEth)) {
            assetsToReceive_ = new address[](1);

            assetsToReceive_[0] = WETH_TOKEN;
        }
        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @return initArgs_ Parsed and encoded args for ExternalPositionProxy.init()
    function parseInitArgs(address, bytes memory) external pure override returns (bytes memory initArgs_) {
        return "";
    }

    /// @dev Helper to validate a Kiln StakingContract
    function __validateStakingContract(address _who) private view {
        require(
            ADDRESS_LIST_REGISTRY_CONTRACT.isInList(STAKING_CONTRACTS_LIST_ID, _who),
            "__validateStakingContract: Invalid staking contract"
        );
    }
}
