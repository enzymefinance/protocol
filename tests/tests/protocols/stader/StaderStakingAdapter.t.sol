// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IStaderStakePoolsManager} from "tests/interfaces/external/IStaderStakePoolsManager.sol";
import {TestBase} from "tests/tests/protocols/utils/GenericWrappingAdapterBase.sol";

address constant ETHEREUM_ETHX_ADDRESS = 0xA35b1B31Ce002FBF2058D22F30f95D405200A15b;
address constant ETHEREUM_STADER_STAKE_POOLS_MANAGER = 0xcf5EA1b38380f6aF39068375516Daf40Ed70D299;

abstract contract StaderStakingAdapterTestBase is TestBase {
    function __deployAdapter(EnzymeVersion _version, address _staderStakePoolsManagerAddress, address _ethxAddress)
        private
        returns (address adapterAddress_)
    {
        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(_version),
            _staderStakePoolsManagerAddress,
            _ethxAddress,
            address(wrappedNativeToken)
        );

        return deployCode("StaderStakingAdapter.sol", args);
    }

    function __initializeStader(EnzymeVersion _version, address _staderStakePoolsManagerAddress, address _ethxAddress)
        internal
    {
        __initialize({
            _version: _version,
            _adapterAddress: __deployAdapter(_version, _staderStakePoolsManagerAddress, _ethxAddress),
            _underlyingTokenAddress: address(wethToken),
            _derivativeTokenAddress: _ethxAddress,
            _ratePerUnderlying: IStaderStakePoolsManager(_staderStakePoolsManagerAddress).previewDeposit(1 ether),
            _testWrap: true,
            _testUnwrap: false
        });
    }
}

abstract contract EthereumStaderStakingAdapterTestBase is StaderStakingAdapterTestBase {
    function __initializeStaderEthereum(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();

        __initializeStader({
            _version: _version,
            _staderStakePoolsManagerAddress: ETHEREUM_STADER_STAKE_POOLS_MANAGER,
            _ethxAddress: ETHEREUM_ETHX_ADDRESS
        });
    }
}

contract StaderStakingAdapterTest is EthereumStaderStakingAdapterTestBase {
    function setUp() public override {
        __initializeStaderEthereum({_version: EnzymeVersion.Current});
    }
}

contract StaderStakingAdapterTestV4 is EthereumStaderStakingAdapterTestBase {
    function setUp() public override {
        __initializeStaderEthereum({_version: EnzymeVersion.V4});
    }
}
