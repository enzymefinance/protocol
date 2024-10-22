// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IDivaEther} from "tests/interfaces/external/IDivaEther.sol";
import {TestBase} from "tests/tests/protocols/utils/GenericWrappingAdapterBase.sol";

// TODO: Update this address when DIVETH is deployed
address constant ETHEREUM_DIVETH_ADDRESS = address(0);

abstract contract DivaStakingAdapterTestBase is TestBase {
    // DEPLOYMENT
    function __deployAdapter(EnzymeVersion _version) private returns (address adapterAddress_) {
        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(_version),
            ETHEREUM_DIVETH_ADDRESS,
            address(wrappedNativeToken),
            address(0)
        );

        return deployCode("DivaStakingAdapter.sol", args);
    }

    // INITIALIZE HELPER
    function __initializeDiva(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();

        __initialize({
            _version: _version,
            _adapterAddress: __deployAdapter({_version: _version}),
            _underlyingTokenAddress: address(wethToken),
            _derivativeTokenAddress: ETHEREUM_DIVETH_ADDRESS,
            _ratePerUnderlying: IDivaEther(ETHEREUM_DIVETH_ADDRESS).convertToShares(assetUnit(wethToken)),
            _testWrap: true,
            _testUnwrap: false
        });
    }
}
// TODO: Uncomment once Diva is deployed
// contract DivaStakingAdapterTest is DivaStakingAdapterTestBase {
//     function setUp() public override {
//         __initializeDiva({_version: EnzymeVersion.Current});
//     }
// }

// contract DivaStakingAdapterTestV4 is DivaStakingAdapterTestBase {
//     function setUp() public override {
//         __initializeDiva({_version: EnzymeVersion.V4});
//     }
// }
