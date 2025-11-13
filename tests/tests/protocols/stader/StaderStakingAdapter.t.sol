// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IStaderStakePoolsManager} from "tests/interfaces/external/IStaderStakePoolsManager.sol";
import {TestBase} from "tests/tests/protocols/utils/GenericWrappingAdapterBase.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

address constant ETHEREUM_ETHX_ADDRESS = 0xA35b1B31Ce002FBF2058D22F30f95D405200A15b;
address constant ETHEREUM_STADER_STAKE_POOLS_MANAGER = 0xcf5EA1b38380f6aF39068375516Daf40Ed70D299;

abstract contract StaderStakingAdapterTestBase is TestBase {
    function __deployAdapter(address _staderStakePoolsManagerAddress, address _ethxAddress)
        private
        returns (address adapterAddress_)
    {
        bytes memory args = abi.encode(
            address(core.release.integrationManager),
            _staderStakePoolsManagerAddress,
            _ethxAddress,
            address(wrappedNativeToken)
        );

        return deployCode("StaderStakingAdapter.sol", args);
    }

    function __initializeStader(address _staderStakePoolsManagerAddress, address _ethxAddress) internal {
        __initialize({
            _adapterAddress: __deployAdapter(_staderStakePoolsManagerAddress, _ethxAddress),
            _underlyingTokenAddress: address(wethToken),
            _derivativeTokenAddress: _ethxAddress,
            _ratePerUnderlying: IStaderStakePoolsManager(_staderStakePoolsManagerAddress).previewDeposit(1 ether),
            _testWrap: true,
            _testUnwrap: false
        });
    }
}

abstract contract EthereumStaderStakingAdapterTestBase is StaderStakingAdapterTestBase {
    function __initializeStaderEthereum() internal {
        setUpMainnetEnvironment();

        __initializeStader({
            _staderStakePoolsManagerAddress: ETHEREUM_STADER_STAKE_POOLS_MANAGER, _ethxAddress: ETHEREUM_ETHX_ADDRESS
        });
    }
}

contract StaderStakingAdapterTest is EthereumStaderStakingAdapterTestBase {
    function setUp() public override {
        __initializeStaderEthereum();
    }
}
