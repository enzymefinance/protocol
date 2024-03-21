// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ISwellSweth} from "tests/interfaces/external/ISwellSweth.sol";
import {TestBase} from "tests/tests/protocols/utils/GenericWrappingAdapterBase.sol";

address constant ETHEREUM_SWETH_ADDRESS = 0xf951E335afb289353dc249e82926178EaC7DEd78;

abstract contract SwellStakingAdapterTestBase is TestBase {
    // DEPLOYMENT
    function __deployAdapter(EnzymeVersion _version) private returns (address swellStakingAdapterAddress_) {
        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(_version),
            ETHEREUM_SWETH_ADDRESS,
            address(wrappedNativeToken),
            address(0)
        );

        return deployCode("SwellStakingAdapter.sol", args);
    }

    // INITIALIZE HELPER
    function __initializeSwell(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();

        __initialize({
            _version: _version,
            _adapterAddress: __deployAdapter({_version: _version}),
            _underlyingTokenAddress: address(wethToken),
            _derivativeTokenAddress: ETHEREUM_SWETH_ADDRESS,
            _ratePerUnderlying: ISwellSweth(ETHEREUM_SWETH_ADDRESS).ethToSwETHRate(),
            _testWrap: true,
            _testUnwrap: false
        });
    }
}

contract SwellStakingAdapterTest is SwellStakingAdapterTestBase {
    function setUp() public override {
        __initializeSwell({_version: EnzymeVersion.Current});
    }
}

contract SwellStakingAdapterTestV4 is SwellStakingAdapterTestBase {
    function setUp() public override {
        __initializeSwell({_version: EnzymeVersion.V4});
    }
}
