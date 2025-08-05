// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ISwellSweth} from "tests/interfaces/external/ISwellSweth.sol";
import {TestBase} from "tests/tests/protocols/utils/GenericWrappingAdapterBase.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

address constant ETHEREUM_SWETH_ADDRESS = 0xf951E335afb289353dc249e82926178EaC7DEd78;

abstract contract SwellStakingAdapterTestBase is TestBase {
    // DEPLOYMENT
    function __deployAdapter() private returns (address swellStakingAdapterAddress_) {
        bytes memory args = abi.encode(
            address(core.release.integrationManager), ETHEREUM_SWETH_ADDRESS, address(wrappedNativeToken), address(0)
        );

        return deployCode("SwellStakingAdapter.sol", args);
    }

    // INITIALIZE HELPER
    function __initializeSwell() internal {
        setUpMainnetEnvironment();

        __initialize({
            _adapterAddress: __deployAdapter(),
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
        __initializeSwell();
    }
}
