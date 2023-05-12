// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {UnitTest} from "tests/bases/UnitTest.sol";
import {DeploymentUtils} from "tests/utils/core/DeploymentUtils.sol";

import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";

abstract contract ExternalPositionFactoryTest is UnitTest, DeploymentUtils {
    event PositionDeployed(
        address indexed vaultProxy, uint256 indexed typeId, address indexed constructLib, bytes constructData
    );

    event PositionDeployerAdded(address positionDeployer);

    event PositionDeployerRemoved(address positionDeployer);

    event PositionTypeAdded(uint256 typeId, string label);

    event PositionTypeLabelUpdated(uint256 indexed typeId, string label);

    address internal dummyDispatcherOwner = makeAddr("DummyDispatcherOwner");
    address internal dummyDispatcher = makeAddr("DummyDispatcher");
    IExternalPositionFactory internal factory;

    function setUp() public virtual {
        factory = deployExternalPositionFactory(IDispatcher(dummyDispatcher));

        mockGetOwner(dummyDispatcher, dummyDispatcherOwner);
    }

    function mockGetOwner(address _dispatcher, address _dispatcherOwner) public {
        vm.mockCall(_dispatcher, abi.encodeWithSelector(IDispatcher.getOwner.selector), abi.encode(_dispatcherOwner));
    }
}

contract ExternalPositionFactoryConstructionTest is ExternalPositionFactoryTest {
    function testInitialState() public {
        assertEq(dummyDispatcher, factory.getDispatcher());
    }
}

contract ExternalPositionFactoryOnlyDispatcherOwnerTest is ExternalPositionFactoryTest {
    function testRevertsOnlyDispatcherOwner() public {
        vm.prank(bob);
        vm.expectRevert("Only the Dispatcher owner can call this function");
        factory.addPositionDeployers(new address[](0));
    }
}

contract ExternalPositionFactoryDeployTest is ExternalPositionFactoryTest {
    function testRevertIsNotPositionDeployer() public {
        vm.expectRevert("deploy: Only a position deployer can call this function");
        factory.deploy({_vaultProxy: address(0), _typeId: uint256(0), _constructLib: address(0), _constructData: ""});
    }

    function testDeployWorks() public {
        uint256 typeId = 1;
        address vaultProxy = address(2);
        address constructLib = address(1);
        bytes memory constructData = "";

        address[] memory accounts = new address[](1);
        accounts[0] = bob;

        vm.prank(dummyDispatcherOwner);
        factory.addPositionDeployers(accounts);

        vm.expectEmit(true, true, true, true, address(factory));

        emit PositionDeployed({
            vaultProxy: vaultProxy,
            typeId: typeId,
            constructLib: constructLib,
            constructData: constructData
        });

        // vm.mockCall(constructLib, constructData, "");

        vm.prank(bob);
        address externalPositionProxy = factory.deploy({
            _vaultProxy: vaultProxy,
            _typeId: typeId,
            _constructLib: constructLib,
            _constructData: constructData
        });

        assertEq(factory.isExternalPositionProxy(externalPositionProxy), true);
    }
}

contract ExternalPositionFactoryTypesRegistryTest is ExternalPositionFactoryTest {
    function setUp() public override {
        super.setUp();
        vm.startPrank(dummyDispatcherOwner);
    }

    function testAddNewPositionTypes() public {
        string memory firstLabel = "test label 0";
        string memory secondLabel = "test label 1";
        uint256 firstTypeId = 0;
        uint256 secondTypeId = 1;

        string[] memory labels = new string[](2);
        labels[0] = firstLabel;
        labels[1] = secondLabel;

        vm.expectEmit(true, true, true, true, address(factory));
        emit PositionTypeAdded({typeId: firstTypeId, label: firstLabel});
        vm.expectEmit(true, true, true, true, address(factory));
        emit PositionTypeAdded({typeId: secondTypeId, label: secondLabel});

        factory.addNewPositionTypes(labels);

        assertEq(factory.getLabelForPositionType(firstTypeId), firstLabel);
        assertEq(factory.getLabelForPositionType(secondTypeId), secondLabel);
    }

    function testUdatePositionTypeLabels() public {
        string memory firstLabel = "test label 0";
        string memory secondLabel = "test label 1";
        string memory thirdLabel = "test label 2";
        uint256 firstTypeId = 0;
        uint256 secondTypeId = 1;
        uint256 thirdTypeId = 2;
        string memory secondLabelUpdated = "test label updated 1";
        string memory thirdLabelUpdated = "test label updated 2";

        string[] memory labelsToAdd = new string[](3);
        labelsToAdd[0] = firstLabel;
        labelsToAdd[1] = secondLabel;
        labelsToAdd[2] = thirdLabel;

        factory.addNewPositionTypes(labelsToAdd);

        string[] memory labelsToUpdte = new string[](2);
        labelsToUpdte[0] = secondLabelUpdated;
        labelsToUpdte[1] = thirdLabelUpdated;

        uint256[] memory typeIdsToUpdte = new uint256[](2);
        typeIdsToUpdte[0] = secondTypeId;
        typeIdsToUpdte[1] = thirdTypeId;

        vm.expectEmit(true, true, true, true, address(factory));
        emit PositionTypeLabelUpdated({typeId: secondTypeId, label: secondLabelUpdated});
        vm.expectEmit(true, true, true, true, address(factory));
        emit PositionTypeLabelUpdated({typeId: thirdTypeId, label: thirdLabelUpdated});

        factory.updatePositionTypeLabels(typeIdsToUpdte, labelsToUpdte);

        assertEq(factory.getLabelForPositionType(firstTypeId), firstLabel);
        assertEq(factory.getLabelForPositionType(secondTypeId), secondLabelUpdated);
        assertEq(factory.getLabelForPositionType(thirdTypeId), thirdLabelUpdated);
    }

    function testRevertsOnUdatePositionTypeLabelsWithUnequalArrays() public {
        string[] memory labels = new string[](3);
        labels[0] = "";
        labels[1] = "";
        labels[2] = "";

        uint256[] memory typeIds = new uint256[](2);
        typeIds[0] = 0;
        typeIds[1] = 0;

        vm.expectRevert("updatePositionTypeLabels: Unequal arrays");
        factory.updatePositionTypeLabels(typeIds, labels);
    }
}

contract ExternalPositionFactoryPositionDeployersTest is ExternalPositionFactoryTest {
    function setUp() public override {
        super.setUp();
        vm.startPrank(dummyDispatcherOwner);
    }

    function testAddPositionDeployers() public {
        address[] memory accounts = new address[](2);
        accounts[0] = bob;
        accounts[1] = alice;

        for (uint256 i; i < accounts.length; i++) {
            vm.expectEmit(true, true, true, true, address(factory));
            emit PositionDeployerAdded(accounts[i]);
        }

        factory.addPositionDeployers(accounts);

        for (uint256 i; i < accounts.length; i++) {
            assertEq(factory.isPositionDeployer(accounts[i]), true);
        }
    }

    function testRevertAlreadyAPositionDeployerAddTwice() public {
        address[] memory accounts = new address[](2);
        accounts[0] = bob;
        accounts[1] = alice;

        factory.addPositionDeployers(accounts);

        vm.expectRevert("addPositionDeployers: Account is already a position deployer");
        factory.addPositionDeployers(accounts);
    }

    function testRevertAlreadyAPositionDeployerAddNotUnique() public {
        address[] memory accounts = new address[](2);
        accounts[0] = bob;
        accounts[1] = bob;

        vm.expectRevert("addPositionDeployers: Account is already a position deployer");
        factory.addPositionDeployers(accounts);
    }

    function testRemovePositionDeployers() public {
        address[] memory accounts = new address[](2);
        accounts[0] = bob;
        accounts[1] = alice;

        for (uint256 i; i < accounts.length; i++) {
            vm.expectEmit(true, true, true, true, address(factory));
            emit PositionDeployerRemoved(accounts[i]);
        }

        factory.addPositionDeployers(accounts);
        factory.removePositionDeployers(accounts);

        for (uint256 i; i < accounts.length; i++) {
            assertEq(factory.isPositionDeployer(accounts[i]), false);
        }
    }

    function testRevertAccountIsNotAPositionDeployer() public {
        address[] memory accounts = new address[](1);
        accounts[0] = bob;

        vm.expectRevert("removePositionDeployers: Account is not a position deployer");
        factory.removePositionDeployers(accounts);
    }
}
