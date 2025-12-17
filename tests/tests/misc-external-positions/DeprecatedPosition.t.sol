// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20 as IERC20Prod} from "openzeppelin-solc-0.8/token/ERC20/IERC20.sol";

import {
    IExternalPosition as IExternalPositionProd
} from "contracts/release/extensions/external-position-manager/IExternalPosition.sol";
import {
    IExternalPositionParser as IExternalPositionParserProd
} from "contracts/release/extensions/external-position-manager/IExternalPositionParser.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IDeprecatedPosition} from "tests/interfaces/internal/IDeprecatedPosition.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

contract MockExternalPositionLib is IExternalPositionProd {
    function init(bytes memory) external pure override {}

    function receiveCallFromVault(bytes memory) external pure override {}

    function getDebtAssets() external pure override returns (address[] memory, uint256[] memory) {}

    function getManagedAssets() external pure override returns (address[] memory, uint256[] memory) {}
}

contract MockExternalPositionParser is IExternalPositionParserProd {
    function parseAssetsForAction(address, uint256, bytes memory)
        external
        returns (address[] memory, uint256[] memory, address[] memory)
    {}

    function parseInitArgs(address, bytes memory) external returns (bytes memory) {}
}

contract DeprecatedPositionTest is IntegrationTest {
    IERC20 usdtToken = IERC20(ETHEREUM_USDT); // Use USDT because it has annoying behavior

    IDeprecatedPosition deprecatedPosition;

    address fundOwner;
    address comptrollerProxyAddress;
    address vaultProxyAddress;

    // Creates a fund that holds a deprecated position
    function setUp() public override {
        setUpMainnetEnvironment();

        // Deploy initial EP contracts
        address initialLibAddress = address(new MockExternalPositionLib());
        address initialParserAddress = address(new MockExternalPositionParser());

        // Register the EP type with its initial contracts
        uint256 typeId = registerExternalPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _label: "POSITION_TO_BE_DEPRECATED",
            _lib: initialLibAddress,
            _parser: initialParserAddress
        });

        // Create a fund
        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        comptrollerProxyAddress = address(comptrollerProxy);
        vaultProxyAddress = address(vaultProxy);

        // Deploy the position to be deprecated
        vm.prank(fundOwner);
        address positionAddress = createExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _typeId: typeId,
            _initializationData: "",
            _callOnExternalPositionCallArgs: ""
        });

        // Update to the deprecated lib and no parser
        address deprecatedLibAddress = __deployDeprecatedPositionLib();
        address deprecatedParserAddress = address(0);
        vm.prank(core.release.fundDeployer.getOwner());
        core.release.externalPositionManager
            .updateExternalPositionTypesInfo({
                _typeIds: toArray(typeId),
                _libs: toArray(deprecatedLibAddress),
                _parsers: toArray(deprecatedParserAddress)
            });

        // Assign the deprecated position
        deprecatedPosition = IDeprecatedPosition(positionAddress);
    }

    // DEPLOYMENT HELPERS

    function __deployDeprecatedPositionLib() internal returns (address libAddress_) {
        return deployCode("DeprecatedPositionLib.sol");
    }

    // TESTS

    function test_callFromVaultOwner_fail_notVaultOwner() public {
        address assetManager = makeAddr("assetManager");
        address randomUser = makeAddr("randomUser");

        bytes4 revertSelector = IDeprecatedPosition.DeprecatedPositionLib__OnlyVaultOwner.selector;

        vm.expectRevert(revertSelector);
        vm.prank(assetManager);
        deprecatedPosition.callFromVaultOwner({_target: address(0), _data: "", _value: 0});

        vm.expectRevert(revertSelector);
        vm.prank(randomUser);
        deprecatedPosition.callFromVaultOwner({_target: address(0), _data: "", _value: 0});
    }

    function test_callFromVaultOwner_success_transferToken() public {
        uint256 tokenBalance = 1000e6;
        increaseTokenBalance({_token: usdtToken, _to: address(deprecatedPosition), _amount: tokenBalance});

        address recipient = makeAddr("transferRecipient");
        uint256 transferAmount = tokenBalance / 3;

        vm.prank(fundOwner);
        deprecatedPosition.callFromVaultOwner({
            _target: address(usdtToken),
            _data: abi.encodeWithSelector(IERC20Prod.transfer.selector, recipient, transferAmount),
            _value: 0
        });

        assertEq(usdtToken.balanceOf(address(deprecatedPosition)), tokenBalance - transferAmount);
        assertEq(usdtToken.balanceOf(recipient), transferAmount);
    }

    // ALL INTERFACE FUNCTIONS SHOULD REVERT
    bytes4 deprecatedRevertSelector = IDeprecatedPosition.DeprecatedPositionLib__Deprecated.selector;

    function test_init_fail() public {
        vm.expectRevert(deprecatedRevertSelector);
        deprecatedPosition.init("");
    }

    function test_receiveCallFromVault_fail() public {
        vm.expectRevert(deprecatedRevertSelector);
        vm.prank(address(vaultProxyAddress));
        deprecatedPosition.receiveCallFromVault("");
    }

    function test_getDebtAssets_fail() public {
        vm.expectRevert(deprecatedRevertSelector);
        deprecatedPosition.getDebtAssets();
    }

    function test_getManagedAssets_fail() public {
        vm.expectRevert(deprecatedRevertSelector);
        deprecatedPosition.getManagedAssets();
    }
}
