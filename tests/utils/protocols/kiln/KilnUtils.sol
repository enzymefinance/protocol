// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";
import {UpdateType} from "tests/utils/core/ListRegistryUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IKilnStakingPositionLib} from "tests/interfaces/internal/IKilnStakingPositionLib.sol";
import {IKilnStakingPositionParser} from "tests/interfaces/internal/IKilnStakingPositionParser.sol";

enum Actions {
    Stake,
    ClaimFees,
    SweepEth
}

enum ClaimFeeTypes {
    ExecutionLayer,
    ConsensusLayer,
    All
}

address constant STAKING_CONTRACT_ADDRESS_ETHEREUM = 0x0816DF553a89c4bFF7eBfD778A9706a989Dd3Ce3;

abstract contract KilnDeploymentUtils is AddOnUtilsBase {
    function deployKilnStakingPositionLib(IERC20 _wethToken) internal returns (IKilnStakingPositionLib lib_) {
        bytes memory args = abi.encode(_wethToken);

        return IKilnStakingPositionLib(deployCode("KilnStakingPositionLib.sol", args));
    }

    function deployKilnStakingPositionParser(
        IAddressListRegistry _addressListRegistry,
        uint256 _stakingContractsListId,
        IERC20 _wethToken
    ) internal returns (IKilnStakingPositionParser parser_) {
        bytes memory args = abi.encode(_addressListRegistry, _stakingContractsListId, _wethToken);

        return IKilnStakingPositionParser(deployCode("KilnStakingPositionParser.sol", args));
    }

    function deployKilnStakingPositionType(
        IAddressListRegistry _addressListRegistry,
        IExternalPositionManager _externalPositionManager,
        address _stakingContract,
        IERC20 _wethToken
    ) internal returns (uint256 typeId_, uint256 stakingPositionsListId_) {
        // Create a new AddressListRegistry list for Kiln StakingContract instances
        stakingPositionsListId_ = _addressListRegistry.createList({
            _owner: makeAddr("deployKilnStakingPosition: StakingContractsListOwner"),
            _updateType: uint8(UpdateType.AddAndRemove),
            _initialItems: toArray(_stakingContract)
        });

        // Deploy KilnStakingPosition type contracts
        address kilnStakingPositionLibAddress = address(deployKilnStakingPositionLib(_wethToken));
        address kilnStakingPositionParserAddress = address(
            deployKilnStakingPositionParser({
                _wethToken: _wethToken,
                _addressListRegistry: _addressListRegistry,
                _stakingContractsListId: stakingPositionsListId_
            })
        );

        // Register KilnStakingPosition type
        typeId_ = registerExternalPositionType({
            _externalPositionManager: _externalPositionManager,
            _label: "KILN_STAKING",
            _lib: kilnStakingPositionLibAddress,
            _parser: kilnStakingPositionParserAddress
        });

        return (typeId_, stakingPositionsListId_);
    }
}
