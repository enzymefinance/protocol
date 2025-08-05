// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IDivaEther} from "tests/interfaces/external/IDivaEther.sol";
import {TestBase} from "tests/tests/protocols/utils/GenericWrappingAdapterBase.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

// TODO: Update this address when DIVETH is deployed
address constant ETHEREUM_DIVETH_ADDRESS = address(0);

abstract contract DivaStakingAdapterTestBase is TestBase {
    // DEPLOYMENT
    function __deployAdapter() private returns (address adapterAddress_) {
        bytes memory args = abi.encode(
            address(core.release.integrationManager), ETHEREUM_DIVETH_ADDRESS, address(wrappedNativeToken), address(0)
        );

        return deployCode("DivaStakingAdapter.sol", args);
    }

    // INITIALIZE HELPER
    function __initializeDiva() internal {
        setUpMainnetEnvironment();

        __initialize({
            _adapterAddress: __deployAdapter(),
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
//         __initializeDiva();
//     }
// }
