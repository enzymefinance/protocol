// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IGSNTypes} from "tests/interfaces/external/IGSNTypes.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IGasRelayPaymasterLib} from "tests/interfaces/internal/IGasRelayPaymasterLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {GSNUtils} from "tests/utils/infrastructure/GSNUtils.sol";

abstract contract GasRelayerTestBase is IntegrationTest, GSNUtils {
    event AdditionalRelayUserAdded(address indexed account);
    event AdditionalRelayUserRemoved(address indexed account);

    address fundOwner;
    uint256 fundOwnerPrivateKey;
    IComptrollerLib comptrollerProxy;
    IVaultLib vaultProxy;
    IGasRelayPaymasterLib paymaster;
    address hubAddress;

    function __initialize() internal {
        (fundOwner, fundOwnerPrivateKey) = makeAddrAndKey("FundOwner");

        // Deploy fund
        (address comptrollerProxyAddress, address vaultProxyAddress) = core.release.fundDeployer
            .createNewFund({
                _fundOwner: fundOwner,
                _fundName: "Test Fund",
                _fundSymbol: "TF",
                _denominationAsset: address(wethToken),
                _sharesActionTimelock: 0,
                _feeManagerConfigData: "",
                _policyManagerConfigData: ""
            });

        comptrollerProxy = IComptrollerLib(comptrollerProxyAddress);
        vaultProxy = IVaultLib(payable(vaultProxyAddress));

        // Seed with plenty of wrapped native asset to use gas relaying
        increaseTokenBalance({
            _token: wrappedNativeToken, _to: address(vaultProxy), _amount: assetUnit(wrappedNativeToken) * 100
        });

        // Deploy paymaster for fund
        vm.prank(fundOwner);
        comptrollerProxy.deployGasRelayPaymaster();
        paymaster = IGasRelayPaymasterLib(comptrollerProxy.getGasRelayPaymaster());

        // Get hub from paymaster
        hubAddress = paymaster.getHubAddr();

        // Define simple call to be made
    }

    // HELPERS

    // low-level paymaster.preRelayedCall (avoids need to convert struct type)
    function __preRelayedCall(IGSNTypes.RelayRequest memory _relayRequest) internal {
        vm.prank(hubAddress);
        (bool success,) =
            address(paymaster).call(abi.encodeWithSelector(paymaster.preRelayedCall.selector, _relayRequest, "", "", 0));
        require(success, "preRelayedCall failed");
    }

    function __simpleValidRelayRequest(bool _topUp) internal returns (IGSNTypes.RelayRequest memory relayRequest_) {
        // Call to relay: VaultProxy.addAssetManagers
        address to = address(vaultProxy);
        bytes memory txData =
            abi.encodeWithSelector(IVaultLib.addAssetManagers.selector, toArray(makeAddr("NewAssetManager")));

        // Do not set _from, to force the test to set it
        return gsnConstructRelayRequest({
            _from: makeAddr("DummyFrom"),
            _to: to,
            _txData: txData,
            _paymasterAddress: address(paymaster),
            _topUp: _topUp,
            _relayWorker: makeAddr("RelayWorker")
        });
    }

    // TESTS: PRE-RELAYED CALL

    // TODO: other preRelayedCall validations

    function test_preRelayedCall_failsWithNonZeroValue() public {
        IGSNTypes.RelayRequest memory relayRequest = __simpleValidRelayRequest({_topUp: false});

        relayRequest.request.from = fundOwner;
        relayRequest.request.value = 1;

        vm.expectRevert("preRelayedCall: Non-zero value");
        __preRelayedCall(relayRequest);
    }

    function test_preRelayedCall_failsWithUnauthorizedCaller() public {
        IGSNTypes.RelayRequest memory relayRequest = __simpleValidRelayRequest({_topUp: false});
        address randomUser = makeAddr("RandomUser");

        relayRequest.request.from = randomUser;

        vm.expectRevert("preRelayedCall: Unauthorized caller");
        __preRelayedCall(relayRequest);
    }

    function test_preRelayedCall_successWithVaultPermissionedRole() public {
        IGSNTypes.RelayRequest memory relayRequest = __simpleValidRelayRequest({_topUp: false});

        relayRequest.request.from = fundOwner;

        __preRelayedCall(relayRequest);
    }

    function test_preRelayedCall_successWithAdditionalRelayUser() public {
        address relayUser = makeAddr("RelayUser");
        IGSNTypes.RelayRequest memory relayRequest = __simpleValidRelayRequest({_topUp: false});

        relayRequest.request.from = relayUser;

        // Add relay user
        vm.prank(fundOwner);
        paymaster.addAdditionalRelayUsers(toArray(relayUser));

        // Call should not revert
        __preRelayedCall(relayRequest);
    }

    // TESTS: ADDITIONAL RELAY USERS

    function test_addAdditionalRelayUsers_failsWithUnauthorized() public {
        address randomCaller = makeAddr("RandomCaller");
        address relayUser = makeAddr("RelayUser");

        vm.expectRevert("Only the fund owner can call this function");
        vm.prank(randomCaller);
        paymaster.addAdditionalRelayUsers(toArray(relayUser));
    }

    function test_addAdditionalRelayUsers_failsWithAlreadyRegistered() public {
        address relayUser = makeAddr("RelayUser");

        // Add relay user
        vm.prank(fundOwner);
        paymaster.addAdditionalRelayUsers(toArray(relayUser));

        vm.expectRevert("addAdditionalRelayUsers: User registered");
        vm.prank(fundOwner);
        paymaster.addAdditionalRelayUsers(toArray(relayUser));
    }

    function test_addAdditionalRelayUsers_success() public {
        address[] memory relayUsers = toArray(makeAddr("RelayUser"), makeAddr("RelayUser2"));

        for (uint256 i; i < relayUsers.length; i++) {
            assertFalse(paymaster.isAdditionalRelayUser(relayUsers[i]));
        }

        // Pre-assert events
        for (uint256 i; i < relayUsers.length; i++) {
            expectEmit(address(paymaster));
            emit AdditionalRelayUserAdded(relayUsers[i]);
        }

        // Add relay users
        vm.prank(fundOwner);
        paymaster.addAdditionalRelayUsers(relayUsers);

        // Assert that the users were added
        for (uint256 i; i < relayUsers.length; i++) {
            assertTrue(paymaster.isAdditionalRelayUser(relayUsers[i]));
        }
    }

    function test_removeAdditionalRelayUsers_failsWithUnauthorized() public {
        address randomCaller = makeAddr("RandomCaller");
        address relayUser = makeAddr("RelayUser");

        // Add relay user
        vm.prank(fundOwner);
        paymaster.addAdditionalRelayUsers(toArray(relayUser));

        vm.expectRevert("Only the fund owner can call this function");
        vm.prank(randomCaller);
        paymaster.removeAdditionalRelayUsers(toArray(relayUser));
    }

    function test_removeAdditionalRelayUsers_failsWithNotRegistered() public {
        address relayUser = makeAddr("RelayUser");

        vm.expectRevert("removeAdditionalRelayUsers: User not registered");
        vm.prank(fundOwner);
        paymaster.removeAdditionalRelayUsers(toArray(relayUser));
    }

    function test_removeAdditionalRelayUsers_success() public {
        address[] memory relayUsers = toArray(makeAddr("RelayUser"), makeAddr("RelayUser2"));

        // Add relay users
        vm.prank(fundOwner);
        paymaster.addAdditionalRelayUsers(relayUsers);

        // Pre-assert events
        for (uint256 i; i < relayUsers.length; i++) {
            expectEmit(address(paymaster));
            emit AdditionalRelayUserRemoved(relayUsers[i]);
        }

        // Remove relay users
        vm.prank(fundOwner);
        paymaster.removeAdditionalRelayUsers(relayUsers);

        // Assert that the users were removed
        for (uint256 i; i < relayUsers.length; i++) {
            assertFalse(paymaster.isAdditionalRelayUser(relayUsers[i]));
        }
    }

    function test_e2e_successWithoutTopUp() public {
        // Simple call to test: add an asset manager to the vault
        address newAssetManager = makeAddr("NewAssetManager");
        bytes memory txData = abi.encodeWithSelector(IVaultLib.addAssetManagers.selector, toArray(newAssetManager));

        // Not an asset manager prior to the relayed call
        assertFalse(vaultProxy.isAssetManager(newAssetManager));

        gsnRelayCall({
            _from: fundOwner,
            _to: address(vaultProxy),
            _txData: txData,
            _paymasterAddress: address(paymaster),
            _topUp: false,
            _privateKey: fundOwnerPrivateKey
        });

        // Should now be an asset manager
        assertTrue(vaultProxy.isAssetManager(newAssetManager));
    }
}

contract EthereumGasRelayerTest is GasRelayerTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();

        __initialize();
    }
}
