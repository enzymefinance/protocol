// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {ISingleAssetRedemptionQueueFactory} from "tests/interfaces/internal/ISingleAssetRedemptionQueueFactory.sol";
import {ISingleAssetRedemptionQueueLib} from "tests/interfaces/internal/ISingleAssetRedemptionQueueLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

contract SingleAssetRedemptionQueueTest is IntegrationTest {
    // TODO: would be good to do another redeem test case
    // TODO: for now, this is a V4 test, but at some point should be tested against v5

    event BypassableSharesThresholdSet(uint256 nextSharesAmount);
    event Initialized(address indexed vaultProxy);
    event ManagerAdded(address indexed user);
    event ManagerRemoved(address indexed user);
    event ProxyDeployed(address indexed deployer, address indexed proxyAddress, address indexed vaultProxy);
    event RedemptionAssetSet(IERC20 indexed asset);
    event RedemptionRequestAdded(uint256 indexed id, address indexed user, uint256 sharesAmount);
    event RequestBypassed(uint256 indexed id);
    event RequestWithdrawn(uint256 indexed id);
    event Shutdown();

    ISingleAssetRedemptionQueueFactory internal factory;

    EnzymeVersion internal version = EnzymeVersion.V4;

    function setUp() public virtual override {
        // TODO: this is an unideal setup, but currently the only way to use live persistent contracts
        setUpLiveMainnetEnvironment(ETHEREUM_BLOCK_LATEST);

        factory = __deployFactory({_libAddress: __deployLib()});
    }

    // DEPLOYMENT HELPERS

    function __deployFactory(address _libAddress) internal returns (ISingleAssetRedemptionQueueFactory factory_) {
        bytes memory args = abi.encode(_libAddress);

        return ISingleAssetRedemptionQueueFactory(deployCode("SingleAssetRedemptionQueueFactory.sol", args));
    }

    function __deployLib() internal returns (address libAddress_) {
        // Address listId that always returns false
        uint256 gsnTrustedForwardersAddressListId = 0;

        bytes memory args = abi.encode(
            core.persistent.addressListRegistry, gsnTrustedForwardersAddressListId, core.persistent.globalConfigProxy
        );

        return deployCode("SingleAssetRedemptionQueueLib.sol", args);
    }

    function __deployRedemptionQueueInstance(
        address _vaultProxy,
        address _redemptionAssetAddress,
        uint256 _bypassableSharesThreshold,
        address[] memory _managers
    ) internal returns (ISingleAssetRedemptionQueueLib redemptionQueue_) {
        return ISingleAssetRedemptionQueueLib(
            factory.deployProxy({
                _vaultProxy: _vaultProxy,
                _redemptionAssetAddress: _redemptionAssetAddress,
                _bypassableSharesThreshold: _bypassableSharesThreshold,
                _managers: _managers
            })
        );
    }

    // MISC HELPERS

    // TESTS - REDEMPTION QUEUE SETUP

    function test_factory_deployProxy_success() public {
        address vaultProxyAddress = makeAddr("VaultProxy");
        address redemptionAssetAddress = makeAddr("RedemptionAsset");
        uint256 bypassableSharesThreshold = 123;
        address[] memory managers = toArray(makeAddr("Manager"), makeAddr("Manager2"));

        // TODO: finish this
        // Assert factory event
        // expectEmit(address(factory));
        // emit ProxyDeployed(deployer, address(redemptionQueue), vaultProxyAddress);
        // TODO: add Initialized event for redemptionQueue

        // Deploy a redemptionQueue instance
        address deployer = makeAddr("Deployer");
        vm.prank(deployer);
        ISingleAssetRedemptionQueueLib redemptionQueue = __deployRedemptionQueueInstance({
            _vaultProxy: vaultProxyAddress,
            _redemptionAssetAddress: redemptionAssetAddress,
            _bypassableSharesThreshold: bypassableSharesThreshold,
            _managers: managers
        });

        // Assert redemptionQueue storage
        assertEq(redemptionQueue.getVaultProxy(), vaultProxyAddress, "incorrect vaultProxy");
        assertEq(redemptionQueue.getRedemptionAsset(), redemptionAssetAddress, "incorrect redemptionAsset");
        assertEq(
            redemptionQueue.getBypassableSharesThreshold(),
            bypassableSharesThreshold,
            "incorrect bypassableSharesThreshold"
        );
        for (uint256 i; i < managers.length; i++) {
            assertTrue(redemptionQueue.isManager(managers[i]), "manager not set");
        }
    }

    function test_init_failsWithAlreadyInitialized() public {
        address vaultProxyAddress = makeAddr("VaultProxy");

        ISingleAssetRedemptionQueueLib redemptionQueue = __deployRedemptionQueueInstance({
            _vaultProxy: vaultProxyAddress,
            _redemptionAssetAddress: address(0),
            _bypassableSharesThreshold: 0,
            _managers: new address[](0)
        });

        // Calling init() post-deployment should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.AlreadyInitialized.selector);
        redemptionQueue.init({
            _vaultProxy: vaultProxyAddress,
            _redemptionAsset: address(0),
            _bypassableSharesThreshold: 0,
            _managers: new address[](0)
        });
    }

    function test_init_failsWithUndefinedVaultProxy() public {
        vm.expectRevert(ISingleAssetRedemptionQueueLib.UndefinedVaultProxy.selector);
        __deployRedemptionQueueInstance({
            _vaultProxy: address(0),
            _redemptionAssetAddress: address(0),
            _bypassableSharesThreshold: 0,
            _managers: new address[](0)
        });
    }

    // TESTS - REDEMPTION QUEUE ACTIONS

    struct FundWithRedemptionQueueTestVars {
        ISingleAssetRedemptionQueueLib redemptionQueue;
        address vaultProxyAddress;
        address fundOwner;
        address manager;
        IERC20 redemptionAsset;
        address holder1;
        address holder2;
    }

    struct Snapshot {
        uint256 sharesTotalSupply;
        uint256 redemptionQueueSharesBalance;
        uint256 vaultRedemptionAssetBalance;
        uint256 holder1Balance;
        uint256 holder2Balance;
        uint256 redeemableShares;
    }

    function __setup_fundWithRedemptionQueue(bool _fillQueue)
        public
        returns (FundWithRedemptionQueueTestVars memory testVars_)
    {
        (address comptrollerProxyAddress, address vaultProxyAddress, address fundOwner) =
            createTradingFundForVersion(version);
        IERC20 sharesToken = IERC20(vaultProxyAddress);
        address manager = makeAddr("Manager");

        // Deposits and redemptions should be the same asset for simplicity
        IERC20 redemptionAsset = IERC20(IComptrollerLib(comptrollerProxyAddress).getDenominationAsset());

        ISingleAssetRedemptionQueueLib redemptionQueue = __deployRedemptionQueueInstance({
            _vaultProxy: vaultProxyAddress,
            _redemptionAssetAddress: address(redemptionAsset),
            _bypassableSharesThreshold: 123,
            _managers: toArray(manager)
        });

        // Define holders and buy them some shares
        address holder1 = makeAddr("Holder1");
        address holder2 = makeAddr("Holder2");
        buySharesForVersion({
            _version: version,
            _sharesBuyer: holder1,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _amountToDeposit: assetUnit(redemptionAsset) * 100
        });
        buySharesForVersion({
            _version: version,
            _sharesBuyer: holder2,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _amountToDeposit: assetUnit(redemptionAsset) * 20
        });

        // Increase the fund's balance of the redemption asset, so shares are worth more than original amount
        increaseTokenBalance({
            _token: redemptionAsset,
            _to: vaultProxyAddress,
            _amount: assetUnit(redemptionAsset) * 1000
        });

        // Grant shares allowance to the redemptionQueue for the holders
        vm.prank(holder1);
        IERC20(vaultProxyAddress).approve(address(redemptionQueue), UINT256_MAX);
        vm.prank(holder2);
        IERC20(vaultProxyAddress).approve(address(redemptionQueue), UINT256_MAX);

        // Fill queue with 2 requests from each user
        if (_fillQueue) {
            uint256 holder1SharesBalance = sharesToken.balanceOf(holder1);
            uint256 holder2SharesBalance = sharesToken.balanceOf(holder2);

            vm.prank(holder1);
            redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 3});

            vm.prank(holder2);
            redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 4});

            vm.prank(holder1);
            redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 5});

            vm.prank(holder2);
            redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 6});
        }

        return FundWithRedemptionQueueTestVars({
            redemptionQueue: redemptionQueue,
            vaultProxyAddress: vaultProxyAddress,
            fundOwner: fundOwner,
            manager: manager,
            redemptionAsset: redemptionAsset,
            holder1: holder1,
            holder2: holder2
        });
    }

    function __getSnapshot(FundWithRedemptionQueueTestVars memory _testVars) internal view returns (Snapshot memory) {
        uint256 redeemableShares = 0;

        uint256 startId = _testVars.redemptionQueue.getNextQueuedId();
        uint256 endId = _testVars.redemptionQueue.getNextNewId() - 1;
        for (uint256 id = startId; id <= endId; id++) {
            redeemableShares += _testVars.redemptionQueue.getSharesForRequest(id);
        }

        IERC20 sharesToken = IERC20(_testVars.vaultProxyAddress);
        IERC20 redemptionAsset = IERC20(_testVars.redemptionAsset);

        return Snapshot({
            sharesTotalSupply: sharesToken.totalSupply(),
            redemptionQueueSharesBalance: sharesToken.balanceOf(address(_testVars.redemptionQueue)),
            vaultRedemptionAssetBalance: redemptionAsset.balanceOf(_testVars.vaultProxyAddress),
            holder1Balance: redemptionAsset.balanceOf(_testVars.holder1),
            holder2Balance: redemptionAsset.balanceOf(_testVars.holder2),
            redeemableShares: redeemableShares
        });
    }

    function test_requestRedeem_failsWithZeroShares() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});

        vm.expectRevert(ISingleAssetRedemptionQueueLib.ZeroShares.selector);
        vm.prank(testVars.holder1);
        testVars.redemptionQueue.requestRedeem({_sharesAmount: 0});
    }

    function test_requestRedeem_failsWithShutdown() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});

        // Shutdown the redemptionQueue
        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.shutdown();

        vm.expectRevert(ISingleAssetRedemptionQueueLib.IsShutdown.selector);
        vm.prank(testVars.holder1);
        testVars.redemptionQueue.requestRedeem({_sharesAmount: 123});
    }

    function test_requestRedeem_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});

        // Do redemption requests from 2 different users, with 2 requests from the same user
        __test_requestRedeem({
            _redemptionQueue: testVars.redemptionQueue,
            _redeemer: testVars.holder1,
            _sharesAmount: 123
        });
        __test_requestRedeem({
            _redemptionQueue: testVars.redemptionQueue,
            _redeemer: testVars.holder2,
            _sharesAmount: 456
        });
        __test_requestRedeem({
            _redemptionQueue: testVars.redemptionQueue,
            _redeemer: testVars.holder1,
            _sharesAmount: 789
        });
    }

    function __test_requestRedeem(
        ISingleAssetRedemptionQueueLib _redemptionQueue,
        address _redeemer,
        uint256 _sharesAmount
    ) internal {
        IERC20 sharesToken = IERC20(_redemptionQueue.getVaultProxy());

        uint256 preTxNextNewId = _redemptionQueue.getNextNewId();
        uint256 preTxNextQueuedId = _redemptionQueue.getNextQueuedId();
        uint256 preTxSharesBalance = sharesToken.balanceOf(address(_redemptionQueue));

        // Pre-assert event
        expectEmit(address(_redemptionQueue));
        emit RedemptionRequestAdded(preTxNextNewId, _redeemer, _sharesAmount);

        // Request a redemption
        vm.prank(_redeemer);
        uint256 id = _redemptionQueue.requestRedeem({_sharesAmount: _sharesAmount});
        assertEq(id, preTxNextNewId, "incorrect id");

        // Assert redemption request storage
        assertEq(_redemptionQueue.getSharesForRequest(id), _sharesAmount, "incorrect shares");
        assertEq(_redemptionQueue.getUserForRequest(id), _redeemer, "incorrect user");

        // Assert queue pointers (nextNewId incremented, nextQueuedId unchanged)
        assertEq(_redemptionQueue.getNextNewId(), preTxNextNewId + 1, "incorrect nextNewId");
        assertEq(_redemptionQueue.getNextQueuedId(), preTxNextQueuedId, "incorrect nextQueuedId");

        // Assert shares transferred to the redemptionQueue
        assertEq(
            sharesToken.balanceOf(address(_redemptionQueue)),
            preTxSharesBalance + _sharesAmount,
            "incorrect shares balance"
        );
    }

    function test_withdrawRequest_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 id = 1;
        address randomCaller = makeAddr("RandomCaller");

        // Shutdown redemptionQueue, to make withdrawal possible
        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.shutdown();

        // Attempting to withdraw as an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.withdrawRequest(id);
    }

    function test_withdrawRequest_failsWithNotWithdrawable() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 id = 1;
        address redeemer = testVars.redemptionQueue.getUserForRequest(id);

        // Attempting to withdraw in a non-shutdown state should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.NotWithdrawable.selector);
        vm.prank(redeemer);
        testVars.redemptionQueue.withdrawRequest(id);

        // TODO: test when < nextQueuedId
    }

    function test_withdrawRequest_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 id = 1;
        address redeemer = testVars.redemptionQueue.getUserForRequest(id);
        uint256 requestAmount = testVars.redemptionQueue.getSharesForRequest(id);
        IERC20 sharesToken = IERC20(testVars.vaultProxyAddress);

        uint256 preTxRedeemerSharesBalance = sharesToken.balanceOf(redeemer);

        // Shutdown redemptionQueue, to make withdrawal possible
        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.shutdown();

        // Pre-assert event
        expectEmit(address(testVars.redemptionQueue));
        emit RequestWithdrawn(id);

        vm.prank(redeemer);
        testVars.redemptionQueue.withdrawRequest(id);

        // Assert storage: request removed
        assertEq(testVars.redemptionQueue.getSharesForRequest(id), 0, "non-zero shares");
        assertEq(testVars.redemptionQueue.getUserForRequest(id), address(0), "non-zero user");

        // Assert shares transferred back to the redeemer
        assertEq(
            sharesToken.balanceOf(redeemer), preTxRedeemerSharesBalance + requestAmount, "incorrect shares balance"
        );
    }

    function test_redeemFromQueue_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        address randomCaller = makeAddr("RandomCaller");

        // Attempting to redeem from an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.redeemFromQueue({_endId: 0, _idsToBypass: new uint256[](0)});
    }

    function test_redeemFromQueue_failsWithOutOfRange() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 endId = testVars.redemptionQueue.getNextNewId(); // out-of-range

        // Attempting to redeem with an out-of-range id should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.OutOfRange.selector);
        vm.prank(testVars.manager);
        testVars.redemptionQueue.redeemFromQueue({_endId: endId, _idsToBypass: new uint256[](0)});
    }

    function test_redeemFromQueue_failsWithNotBypassable() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 idToBypass = 0;
        uint256 endId = idToBypass + 1;

        // Double check that the request amount is above the bypassable threshold
        assertGt(
            testVars.redemptionQueue.getSharesForRequest(idToBypass),
            testVars.redemptionQueue.getBypassableSharesThreshold()
        );

        // Attempting to redeem with an out-of-range id should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.NotBypassable.selector);
        vm.prank(testVars.manager);
        testVars.redemptionQueue.redeemFromQueue({_endId: endId, _idsToBypass: toArray(idToBypass)});
    }

    function test_redeemFromQueue_successWithFullQueueAndBypass() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});

        __test_redeemFromQueue_successWithFullQueueAndBypass(testVars);
    }

    function test_requestAndRedeemMultipleTimesFromQueue_successWithFullQueueAndBypass() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});

        __test_redeemFromQueue_successWithFullQueueAndBypass(testVars);

        IERC20 sharesToken = IERC20(testVars.vaultProxyAddress);
        uint256 holder1SharesBalance = sharesToken.balanceOf(testVars.holder1);
        uint256 holder2SharesBalance = sharesToken.balanceOf(testVars.holder2);

        vm.prank(testVars.holder1);
        testVars.redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 3});

        vm.prank(testVars.holder2);
        testVars.redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 6});

        vm.prank(testVars.holder1);
        testVars.redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 4});

        __test_redeemFromQueue_successWithFullQueueAndBypass(testVars);
    }

    function __test_redeemFromQueue_successWithFullQueueAndBypass(FundWithRedemptionQueueTestVars memory _testVars)
        internal
    {
        IERC20 sharesToken = IERC20(_testVars.vaultProxyAddress);
        uint256 startId = _testVars.redemptionQueue.getNextQueuedId();
        uint256 endId = _testVars.redemptionQueue.getNextNewId() - 1;
        uint256 idToBypass = endId - 1;
        uint256 bypassedSharesAmount = _testVars.redemptionQueue.getSharesForRequest(idToBypass);

        // Update the bypassable threshold to be above the request amount to skip
        vm.prank(_testVars.fundOwner);
        _testVars.redemptionQueue.setBypassableSharesThreshold(bypassedSharesAmount);

        Snapshot memory beforeRedemptionSnapshot = __getSnapshot(_testVars);

        uint256 holder1RedeemedShares;
        uint256 holder2RedeemedShares;
        for (uint256 id = startId; id <= endId; id++) {
            if (id != idToBypass) {
                address user = _testVars.redemptionQueue.getUserForRequest(id);
                uint256 sharesAmount = _testVars.redemptionQueue.getSharesForRequest(id);

                if (user == _testVars.holder1) {
                    holder1RedeemedShares += sharesAmount;
                } else {
                    holder2RedeemedShares += sharesAmount;
                }
            }
        }

        // TODO: pre-assert other events
        for (uint256 id = startId; id <= endId; id++) {
            if (id == idToBypass) {
                expectEmit(address(_testVars.redemptionQueue));
                emit RequestBypassed(idToBypass);
            }
        }

        vm.prank(_testVars.manager);
        _testVars.redemptionQueue.redeemFromQueue({_endId: endId, _idsToBypass: toArray(idToBypass)});

        // Assert expected balances
        assertApproxEqAbs(
            _testVars.redemptionAsset.balanceOf(_testVars.holder1) - beforeRedemptionSnapshot.holder1Balance,
            beforeRedemptionSnapshot.vaultRedemptionAssetBalance * holder1RedeemedShares
                / beforeRedemptionSnapshot.sharesTotalSupply,
            1,
            "incorrect holder1 balance"
        );
        assertApproxEqAbs(
            _testVars.redemptionAsset.balanceOf(_testVars.holder2) - beforeRedemptionSnapshot.holder2Balance,
            beforeRedemptionSnapshot.vaultRedemptionAssetBalance * holder2RedeemedShares
                / beforeRedemptionSnapshot.sharesTotalSupply,
            1,
            "incorrect holder2 balance"
        );

        // Assert remaining shares balance
        assertEq(
            beforeRedemptionSnapshot.redemptionQueueSharesBalance - beforeRedemptionSnapshot.redeemableShares
                + bypassedSharesAmount,
            sharesToken.balanceOf(address(_testVars.redemptionQueue)),
            "incorrect remaining shares balance"
        );

        // Assert storage
        assertEq(_testVars.redemptionQueue.getNextQueuedId(), endId + 1, "incorrect nextQueuedId");
        for (uint256 id = startId; id <= endId; id++) {
            if (id == idToBypass) {
                // bypassed request remains
                assertEq(
                    _testVars.redemptionQueue.getSharesForRequest(id), bypassedSharesAmount, "bypassed request removed"
                );
            } else {
                // executed request removed
                assertEq(_testVars.redemptionQueue.getSharesForRequest(id), 0, "non-zero shares in request");
                assertEq(_testVars.redemptionQueue.getUserForRequest(id), address(0), "non-zero user in request");
            }
        }
    }

    // TESTS - OWNER CONFIG ACTIONS

    function test_addManagers_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address randomCaller = makeAddr("RandomCaller");

        // Attempting to add managers as an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.addManagers(toArray(randomCaller));
    }

    function test_addManagers_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address newManager1 = makeAddr("NewManager1");
        address newManager2 = makeAddr("NewManager2");

        // Pre-assert events
        expectEmit(address(testVars.redemptionQueue));
        emit ManagerAdded(newManager1);

        expectEmit(address(testVars.redemptionQueue));
        emit ManagerAdded(newManager2);

        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.addManagers(toArray(newManager1, newManager2));

        // Assert storage
        assertTrue(testVars.redemptionQueue.isManager(newManager1), "manager1 not added");
        assertTrue(testVars.redemptionQueue.isManager(newManager2), "manager2 not added");
    }

    function test_removeManagers_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address randomCaller = makeAddr("RandomCaller");

        // Attempting to remove managers as an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.removeManagers(toArray(testVars.manager));
    }

    function test_removeManagers_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address managerToRemove1 = makeAddr("NewManager1");
        address managerToRemove2 = makeAddr("NewManager2");

        // Add managers
        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.addManagers(toArray(managerToRemove1, managerToRemove2));

        // Pre-assert events
        expectEmit(address(testVars.redemptionQueue));
        emit ManagerRemoved(managerToRemove1);

        expectEmit(address(testVars.redemptionQueue));
        emit ManagerRemoved(managerToRemove2);

        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.removeManagers(toArray(managerToRemove1, managerToRemove2));

        // Assert storage
        assertFalse(testVars.redemptionQueue.isManager(managerToRemove1), "manager1 not removed");
        assertFalse(testVars.redemptionQueue.isManager(managerToRemove2), "manager2 not removed");
    }

    function test_setBypassableSharesThreshold_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address randomCaller = makeAddr("RandomCaller");

        // Attempting to set the bypassable shares threshold as an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.setBypassableSharesThreshold(123);
    }

    function test_setBypassableSharesThreshold_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        uint256 newThreshold = testVars.redemptionQueue.getBypassableSharesThreshold() + 123;

        // Pre-assert event
        expectEmit(address(testVars.redemptionQueue));
        emit BypassableSharesThresholdSet(newThreshold);

        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.setBypassableSharesThreshold(newThreshold);

        // Assert storage
        assertEq(
            testVars.redemptionQueue.getBypassableSharesThreshold(), newThreshold, "incorrect bypassableSharesThreshold"
        );
    }

    function test_setRedemptionAsset_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address randomCaller = makeAddr("RandomCaller");

        // Attempting to set the redemption asset as an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.setRedemptionAsset(address(0));
    }

    function test_setRedemptionAsset_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        IERC20 newRedemptionAsset = IERC20(makeAddr("NewRedemptionAsset"));

        // Pre-assert event
        expectEmit(address(testVars.redemptionQueue));
        emit RedemptionAssetSet(newRedemptionAsset);

        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.setRedemptionAsset(address(newRedemptionAsset));

        // Assert storage
        assertEq(
            testVars.redemptionQueue.getRedemptionAsset(), address(newRedemptionAsset), "incorrect redemptionAsset"
        );
    }

    function test_shutdown_failsWithUnauthorized() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});
        address randomCaller = makeAddr("RandomCaller");

        // Attempting to shutdown as an unauthorized user should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.Unauthorized.selector);
        vm.prank(randomCaller);
        testVars.redemptionQueue.shutdown();
    }

    function test_shutdown_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: false});

        // Pre-assert event
        expectEmit(address(testVars.redemptionQueue));
        emit Shutdown();

        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.shutdown();

        // Assert storage
        assertTrue(testVars.redemptionQueue.queueIsShutdown(), "not shutdown");
    }
}
