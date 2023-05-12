// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";
import {ExternalPositionUtils} from "tests/utils/core/ExternalPositionUtils.sol";
import {UpdateType} from "tests/utils/core/ListRegistryUtils.sol";

import {IWETH} from "tests/interfaces/external/IWETH.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IKilnStakingPositionLib} from "tests/interfaces/internal/IKilnStakingPositionLib.sol";
import {IKilnStakingPositionParser} from "tests/interfaces/internal/IKilnStakingPositionParser.sol";

enum Actions {
    Stake,
    ClaimFees,
    WithdrawEth
}

address constant STAKING_CONTRACT_ADDRESS_ETHEREUM = 0x0816DF553a89c4bFF7eBfD778A9706a989Dd3Ce3;

abstract contract KilnUtils is Test, ExternalPositionUtils {
    function deployKilnStaking(
        address _stakingContract,
        IWETH _wethToken,
        IDispatcher _dispatcher,
        IExternalPositionManager _externalPositionManager,
        IAddressListRegistry _addressListRegistry
    )
        public
        returns (
            IKilnStakingPositionLib kilnStakingPositionLib_,
            IKilnStakingPositionParser kilnStakingPositionParser_,
            uint256 typeId_
        )
    {
        address[] memory initialItems = new address[](1);

        initialItems[0] = _stakingContract;

        uint256 stakingContractsListId = _addressListRegistry.createList({
            _owner: address(_dispatcher),
            _updateType: uint8(UpdateType.AddAndRemove),
            _initialItems: initialItems
        });

        kilnStakingPositionLib_ = deployKilnStakingPositionLib(_wethToken);
        kilnStakingPositionParser_ = deployKilnStakingPositionParser({
            _wethToken: _wethToken,
            _addressListRegistry: _addressListRegistry,
            _stakingContractsListId: stakingContractsListId
        });

        string[] memory labels = new string[](1);
        labels[0] = "KILN_STAKING";

        address[] memory libs = new address[](1);
        libs[0] = address(kilnStakingPositionLib_);

        address[] memory parsers = new address[](1);
        parsers[0] = address(kilnStakingPositionParser_);

        uint256[] memory typeIds = registerExternalPositions({
            _labels: labels,
            _libs: libs,
            _parsers: parsers,
            _externalPositionManager: _externalPositionManager
        });

        return (kilnStakingPositionLib_, kilnStakingPositionParser_, typeIds[0]);
    }

    function deployKilnStakingPositionParser(
        IAddressListRegistry _addressListRegistry,
        uint256 _stakingContractsListId,
        IWETH _wethToken
    ) public returns (IKilnStakingPositionParser) {
        bytes memory args = abi.encode(_addressListRegistry, _stakingContractsListId, _wethToken);
        address addr = deployCode("KilnStakingPositionParser.sol", args);
        return IKilnStakingPositionParser(addr);
    }

    function deployKilnStakingPositionLib(IWETH _weth) public returns (IKilnStakingPositionLib) {
        bytes memory args = abi.encode(_weth);
        address addr = deployCode("KilnStakingPositionLib.sol", args);
        return IKilnStakingPositionLib(addr);
    }
}
