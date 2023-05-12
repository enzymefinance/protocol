// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {UnitTest} from "tests/bases/UnitTest.sol";
import {DeploymentUtils} from "tests/utils/core/DeploymentUtils.sol";

import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPosition} from "tests/interfaces/internal/IExternalPosition.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IExternalPositionProxy} from "tests/interfaces/internal/IExternalPositionProxy.sol";
import {IExternalPositionVault} from "tests/interfaces/internal/IExternalPositionVault.sol";

abstract contract ExternalPositionProxyTest is UnitTest, DeploymentUtils {
    address internal dummyVaultProxy = makeAddr("DummyVaultProxy");
    IExternalPositionFactory internal externalPositionFactory;
    IExternalPositionProxy internal externalPositionProxy;

    function setUp() public virtual {
        address[] memory positionDeployers = new address[](1);
        positionDeployers[0] = address(this);

        // We deploy a semi-realistic dispatcher and factory to test proxy construction. Otherwise, we wouldn't be able to test
        // the constructor validation logic in the ExternalPositionProxy since reverts produced with `deployCode` are not testable
        // with `vm.expectRevert` currently: https://github.com/foundry-rs/foundry/issues/4589
        IDispatcher dispatcher = deployDispatcher();
        externalPositionFactory = deployExternalPositionFactory(dispatcher);
        externalPositionFactory.addPositionDeployers(positionDeployers);

        externalPositionProxy = IExternalPositionProxy(
            externalPositionFactory.deploy({
                _vaultProxy: dummyVaultProxy,
                _typeId: 1,
                _constructLib: makeAddr("DummyExternalPositionLib"),
                _constructData: ""
            })
        );
    }
}

contract ExternalPositionProxyConstructionTest is ExternalPositionProxyTest {
    function testConstruction() public {
        uint256 typeId = 1;
        address constructLib = makeAddr("DummyExternalPositionLib");
        bytes memory constructData = "";

        IExternalPositionProxy externalPositionProxy = IExternalPositionProxy(
            externalPositionFactory.deploy({
                _vaultProxy: dummyVaultProxy,
                _typeId: typeId,
                _constructLib: constructLib,
                _constructData: constructData
            })
        );

        assertEq(externalPositionProxy.getVaultProxy(), dummyVaultProxy);
        assertEq(externalPositionProxy.getExternalPositionType(), typeId);
    }

    function testConstructionReverts() public {
        uint256 typeId = 1;
        address constructLib = address(new Reverter());
        bytes memory constructData = abi.encodeWithSignature("revertPlease()");

        vm.expectRevert(formatError("revert from mock reverter"));
        externalPositionFactory.deploy({
            _vaultProxy: dummyVaultProxy,
            _typeId: typeId,
            _constructLib: constructLib,
            _constructData: constructData
        });
    }
}

contract ExternalPositionProxyReceiveCallFromVaultTest is ExternalPositionProxyTest {
    function testReceiveCallFromVault() public {
        address contractLogic = address(1);
        bytes memory data = abi.encode(address(2));

        vm.prank(dummyVaultProxy);
        vm.mockCall(
            dummyVaultProxy,
            abi.encodeWithSelector(IExternalPositionVault.getExternalPositionLibForType.selector),
            abi.encode(contractLogic)
        );

        bytes memory contractCallData = abi.encodeWithSelector(IExternalPosition.receiveCallFromVault.selector, data);

        vm.mockCall(contractLogic, contractCallData, "");
        vm.expectCall(contractLogic, contractCallData);

        externalPositionProxy.receiveCallFromVault(data);
    }

    function testRevertsReceiveCallFromVault() public {
        address reverter = address(new Reverter());
        bytes memory data = abi.encode(address(2));

        vm.prank(dummyVaultProxy);
        vm.mockCall(
            dummyVaultProxy,
            abi.encodeWithSelector(IExternalPositionVault.getExternalPositionLibForType.selector),
            abi.encode(reverter)
        );

        bytes memory contractCallData = abi.encodeWithSelector(IExternalPosition.receiveCallFromVault.selector, data);

        vm.expectCall(reverter, contractCallData);
        vm.expectRevert(formatError("revert from mock reverter"));
        externalPositionProxy.receiveCallFromVault(data);
    }

    function testRevertOnlyVaultCanMakeVall() public {
        vm.prank(bob);
        vm.expectRevert("receiveCallFromVault: Only the vault can make this call");
        externalPositionProxy.receiveCallFromVault("");
    }
}

contract Reverter {
    fallback() external payable {
        revert("revert from mock reverter");
    }
}
