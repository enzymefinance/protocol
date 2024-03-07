// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ILiquityDebtPosition as ILiquityDebtPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/liquity-debt/ILiquityDebtPosition.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {ILiquityDebtPositionLib} from "tests/interfaces/internal/ILiquityDebtPositionLib.sol";

address constant LIQUITY_BORROWER_OPERATIONS = 0x24179CD81c9e782A4096035f7eC97fB8B783e007;
address constant LIQUITY_COL_SURPLUS_POOL = 0x3D32e8b97Ed5881324241Cf03b2DA5E2EBcE5521;
address constant LIQUITY_TROVE_MANAGER = 0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2;

contract TestBase is IntegrationTest {
    ILiquityDebtPositionLib internal liquityPosition;
    address internal comptrollerProxyAddress;
    address internal vaultProxyAddress;
    address internal fundOwner;

    EnzymeVersion internal version;

    function setUp() public virtual override {
        // TODO: remove fork block number later; needed now for bugfix test
        setUpMainnetEnvironment(19378000);

        // TODO: update these later to locally-deployed stuff; needed now for bugfix test
        liquityPosition = ILiquityDebtPositionLib(0xB5829dfc366EEcDdfec5600a751E1d0906DfBd19);
        comptrollerProxyAddress = 0x1A6E4f75EeD0e610C3C0c2F5AF7dA6eE2a3593c6;
        vaultProxyAddress = 0x86758FdE8e8924BE2b9Fa440fF9D8C33a4E064A5;
        fundOwner = 0x6C48814701c98F0D24b1B891fAC254A817Aadfdf;

        // TODO: only testing against v4 for now
        version = EnzymeVersion.V4;
    }

    // DEPLOYMENT HELPERS

    function __deployLib() internal returns (address libAddress_) {
        bytes memory args = abi.encode(
            LIQUITY_BORROWER_OPERATIONS, LIQUITY_COL_SURPLUS_POOL, LIQUITY_TROVE_MANAGER, ETHEREUM_LUSD, wethToken
        );

        return deployCode("LiquityDebtPositionLib.sol", args);
    }

    function __deployParser() internal returns (address parserAddress_) {
        bytes memory args = abi.encode(LIQUITY_TROVE_MANAGER, ETHEREUM_LUSD, wethToken);

        return deployCode("LiquityDebtPositionParser.sol", args);
    }

    // ACTION HELPERS

    function __claimCollateral() internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(liquityPosition),
            _actionId: uint256(ILiquityDebtPositionProd.Actions.ClaimCollateral),
            _actionArgs: ""
        });
    }

    function test_temp_surplus_collateral_fix() public {
        uint256 surplusCollateralAmount = 247791387261780588060;
        uint256 preClaimVaultWethBalance = wethToken.balanceOf(vaultProxyAddress);

        // Position should have no value to start
        {
            (address[] memory assets, uint256[] memory amounts) = liquityPosition.getManagedAssets();
            assertEq(assets, new address[](0));
            assertEq(amounts, new uint256[](0));
        }

        address newLib = __deployLib();
        address newParser = __deployParser();

        // Update the EP contracts
        vm.prank(v4ReleaseContracts.externalPositionManager.getOwner());
        v4ReleaseContracts.externalPositionManager.updateExternalPositionTypesInfo({
            _typeIds: toArray(5),
            _libs: toArray(newLib),
            _parsers: toArray(newParser)
        });

        // Position should now have value
        {
            (address[] memory assets, uint256[] memory amounts) = liquityPosition.getManagedAssets();
            assertEq(assets, toArray(address(wethToken)));
            assertEq(amounts, toArray(surplusCollateralAmount));
        }

        // Claim the surplus collateral
        __claimCollateral();

        // Vault should have received the weth
        assertEq(wethToken.balanceOf(vaultProxyAddress), preClaimVaultWethBalance + surplusCollateralAmount);

        // Position should now have no value
        {
            (address[] memory assets, uint256[] memory amounts) = liquityPosition.getManagedAssets();
            assertEq(assets, new address[](0));
            assertEq(amounts, new uint256[](0));
        }
    }
}
