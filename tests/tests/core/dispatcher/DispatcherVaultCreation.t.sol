// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {DispatcherTest} from "./Dispatcher.t.sol";

import {IVault} from "tests/interfaces/internal/IVault.sol";

contract DispatcherVaultCreationTest is DispatcherTest {
    event AccessorSet(address prevAccessor, address nextAccessor);
    event OwnerSet(address prevOwner, address nextOwner);
    event VaultLibSet(address prevVaultLib, address nextVaultLib);
    event VaultProxyDeployed(
        address indexed fundDeployer,
        address indexed owner,
        address vaultProxy,
        address indexed vaultLib,
        address vaultAccessor,
        string fundName
    );

    string internal vaultName = "Test Vault";
    address internal dummyVaultAccessor = makeAddr("DummyVaultAccessor");
    address internal dummyFundDeployer = makeAddr("DummyFundDeployer");

    function setUp() public override {
        super.setUp();

        vm.etch(dummyVaultAccessor, "empty");
        vm.etch(dummyFundDeployer, "empty");
        dispatcher.setCurrentFundDeployer(dummyFundDeployer);
    }

    function testHappyPath() public {
        address mockVaultLib = address(deployCode("MockVaultLib.sol"));

        vm.expectEmit(true, true, true, true);
        emit AccessorSet(address(0), dummyVaultAccessor);

        vm.expectEmit(true, true, true, true);
        emit OwnerSet(address(0), alice);

        vm.expectEmit(true, true, true, true);
        emit VaultLibSet(address(0), mockVaultLib);

        vm.expectEmit(true, true, true, true);
        emit VaultProxyDeployed(
            dummyFundDeployer,
            alice,
            computeCreateAddress(address(dispatcher), 1),
            mockVaultLib,
            dummyVaultAccessor,
            vaultName
        );

        vm.prank(dummyFundDeployer);
        address vault = dispatcher.deployVaultProxy(mockVaultLib, alice, dummyVaultAccessor, vaultName);

        assertEq(dummyFundDeployer, dispatcher.getFundDeployerForVaultProxy(vault));
        assertEq(address(dispatcher), IVault(vault).getCreator());
        assertEq(dummyVaultAccessor, IVault(vault).getAccessor());
        assertEq(alice, IVault(vault).getOwner());
        assertEq(address(0), IVault(vault).getMigrator());
        assertEq(vaultName, IVault(vault).name());
        assertEq("", IVault(vault).symbol());
        assertEq(uint256(18), IVault(vault).decimals());
    }

    function testDoesNotAllowBadVaultLib() public {
        address invalidVaultLib = makeAddr("InvalidVaultLib");

        vm.prank(dummyFundDeployer);
        vm.expectRevert();
        dispatcher.deployVaultProxy(invalidVaultLib, alice, dummyVaultAccessor, vaultName);
    }

    function testDoesNotAllowNonContractVaultAccessor() public {
        address mockVaultLib = address(deployCode("MockVaultLib.sol"));
        address invalidVaultAccessor = makeAddr("InvalidVaultAccessor");

        vm.prank(dummyFundDeployer);
        vm.expectRevert("deployVaultProxy: Non-contract _vaultAccessor");
        dispatcher.deployVaultProxy(mockVaultLib, alice, invalidVaultAccessor, vaultName);
    }
}
