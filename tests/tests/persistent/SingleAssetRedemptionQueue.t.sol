// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {ISingleAssetRedemptionQueueFactory} from "tests/interfaces/internal/ISingleAssetRedemptionQueueFactory.sol";
import {ISingleAssetRedemptionQueueLib} from "tests/interfaces/internal/ISingleAssetRedemptionQueueLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {Uint256ArrayLib} from "tests/utils/libs/Uint256ArrayLib.sol";

contract SingleAssetRedemptionQueueTest is IntegrationTest {
    using Uint256ArrayLib for uint256[];

    event BypassableSharesThresholdSet(uint256 nextSharesAmount);
    event Initialized(address indexed vaultProxy);
    event ManagerAdded(address indexed user);
    event ManagerRemoved(address indexed user);
    event ProxyDeployed(address indexed deployer, address indexed proxyAddress, address indexed vaultProxy);
    event Redeemed(uint256 indexed id, address indexed redemptionAsset, uint256 redemptionAssetAmount);
    event RedemptionAssetSet(IERC20 indexed asset);
    event RedemptionRequestAdded(uint256 indexed id, address indexed user, uint256 sharesAmount);
    event RequestBypassed(uint256 indexed id);
    event RequestWithdrawn(uint256 indexed id);
    event Shutdown();

    ISingleAssetRedemptionQueueFactory internal factory;

    function setUp() public virtual override {
        setUpStandaloneEnvironment();

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

    function __calcTotalSharesInQueue(ISingleAssetRedemptionQueueLib _redemptionQueue)
        internal
        view
        returns (uint256 totalShares_)
    {
        uint256 queueEndId = _redemptionQueue.getNextNewId() - 1;
        for (uint256 id = 0; id <= queueEndId; id++) {
            totalShares_ += _redemptionQueue.getSharesForRequest(id);
        }
    }

    // TESTS - REDEMPTION QUEUE SETUP

    function test_factory_deployProxy_success() public {
        address vaultProxyAddress = makeAddr("VaultProxy");
        address redemptionAssetAddress = makeAddr("RedemptionAsset");
        uint256 bypassableSharesThreshold = 123;
        address[] memory managers = toArray(makeAddr("Manager"), makeAddr("Manager2"));
        address deployer = makeAddr("Deployer");

        address predictedRedemptionQueueAddress = computeCreateAddress(address(factory));

        // Assert redemption queue event initialized event for redemptionQueue
        expectEmit(predictedRedemptionQueueAddress);
        emit Initialized(vaultProxyAddress);

        // Assert factory event
        expectEmit(address(factory));
        emit ProxyDeployed(deployer, predictedRedemptionQueueAddress, vaultProxyAddress);

        // Deploy a redemptionQueue instance
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

    function __setup_fundWithRedemptionQueue(bool _fillQueue)
        public
        returns (FundWithRedemptionQueueTestVars memory testVars_)
    {
        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        address fundOwner;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        address comptrollerProxyAddress = address(comptrollerProxy);
        address vaultProxyAddress = address(vaultProxy);
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
        buyShares({
            _sharesBuyer: holder1,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _amountToDeposit: assetUnit(redemptionAsset) * 100
        });
        buyShares({
            _sharesBuyer: holder2,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _amountToDeposit: assetUnit(redemptionAsset) * 20
        });

        // Increase the fund's balance of the redemption asset, so shares are worth more than original amount
        increaseTokenBalance({
            _token: redemptionAsset, _to: vaultProxyAddress, _amount: assetUnit(redemptionAsset) * 1000
        });

        // Grant shares allowance to the redemptionQueue for the holders
        vm.prank(holder1);
        IERC20(vaultProxyAddress).approve(address(redemptionQueue), UINT256_MAX);
        vm.prank(holder2);
        IERC20(vaultProxyAddress).approve(address(redemptionQueue), UINT256_MAX);

        // Fill queue with requests from each user
        if (_fillQueue) {
            uint256 holder1SharesBalance = sharesToken.balanceOf(holder1);
            uint256 holder2SharesBalance = sharesToken.balanceOf(holder2);

            vm.startPrank(holder1);
            redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 3});
            redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 5});
            redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 7});
            redemptionQueue.requestRedeem({_sharesAmount: holder1SharesBalance / 11});
            vm.stopPrank();

            vm.startPrank(holder2);
            redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 4});
            redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 6});
            redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 8});
            redemptionQueue.requestRedeem({_sharesAmount: holder2SharesBalance / 10});
            vm.stopPrank();
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
            _redemptionQueue: testVars.redemptionQueue, _redeemer: testVars.holder1, _sharesAmount: 123
        });
        __test_requestRedeem({
            _redemptionQueue: testVars.redemptionQueue, _redeemer: testVars.holder2, _sharesAmount: 456
        });
        __test_requestRedeem({
            _redemptionQueue: testVars.redemptionQueue, _redeemer: testVars.holder1, _sharesAmount: 789
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

        // Attempting to withdraw in a non-shutdown and non-bypassed state should fail
        vm.expectRevert(ISingleAssetRedemptionQueueLib.NotWithdrawable.selector);
        vm.prank(redeemer);
        testVars.redemptionQueue.withdrawRequest(id);
    }

    function test_withdrawRequest_successWhenBypassed() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 id = 1;

        // Bypass the request, to make withdrawal possible
        vm.startPrank(testVars.fundOwner);
        testVars.redemptionQueue.setBypassableSharesThreshold(UINT256_MAX);
        testVars.redemptionQueue.redeemFromQueue({_endId: id, _idsToBypass: toArray(id)});
        vm.stopPrank();

        __test_withdrawRequest({_testVars: testVars, _id: id});
    }

    function test_withdrawRequest_successWhenShutdown() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});
        uint256 id = 2;

        // Shutdown redemptionQueue, to make withdrawal possible
        vm.prank(testVars.fundOwner);
        testVars.redemptionQueue.shutdown();

        __test_withdrawRequest({_testVars: testVars, _id: id});
    }

    function __test_withdrawRequest(FundWithRedemptionQueueTestVars memory _testVars, uint256 _id) internal {
        address redeemer = _testVars.redemptionQueue.getUserForRequest(_id);
        uint256 requestAmount = _testVars.redemptionQueue.getSharesForRequest(_id);
        IERC20 sharesToken = IERC20(_testVars.vaultProxyAddress);

        uint256 preTxRedeemerSharesBalance = sharesToken.balanceOf(redeemer);

        // Pre-assert event
        expectEmit(address(_testVars.redemptionQueue));
        emit RequestWithdrawn(_id);

        vm.prank(redeemer);
        _testVars.redemptionQueue.withdrawRequest(_id);

        // Assert storage: request removed
        assertEq(_testVars.redemptionQueue.getSharesForRequest(_id), 0, "non-zero shares");
        assertEq(_testVars.redemptionQueue.getUserForRequest(_id), address(0), "non-zero user");

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

    // Tests:
    // - partial queue redemption
    // - full queue redemption
    // - bypassed items
    function test_redeemFromQueue_success() public {
        FundWithRedemptionQueueTestVars memory testVars = __setup_fundWithRedemptionQueue({_fillQueue: true});

        uint256 queueEnd = testVars.redemptionQueue.getNextNewId() - 1;

        // Sanity check that there are enough requests in the queue for the multiple redemptions
        assertGt(queueEnd, 6, "not enough requests in queue");

        // Partial redemption at start of queue; bypass final item
        {
            uint256 endId = 2;
            uint256[] memory idsToBypass = toArray(endId);

            __test_redeemFromQueue({_testVars: testVars, _idsToBypass: idsToBypass, _endId: endId});
        }

        // Full redemption of remaining items; bypass a couple items in the middle
        {
            uint256 endId = queueEnd;
            uint256[] memory idsToBypass = toArray(endId - 2, endId - 1);

            __test_redeemFromQueue({_testVars: testVars, _idsToBypass: idsToBypass, _endId: endId});
        }
    }

    function __test_redeemFromQueue(
        FundWithRedemptionQueueTestVars memory _testVars,
        uint256[] memory _idsToBypass,
        uint256 _endId
    ) internal {
        IERC20 sharesToken = IERC20(_testVars.vaultProxyAddress);
        uint256 startId = _testVars.redemptionQueue.getNextQueuedId();

        // Calc expected redeemed and bypassed shares amounts
        uint256 holder1RedeemedShares;
        uint256 holder2RedeemedShares;
        uint256 bypassedSharesAmount;
        uint256 highestBypassedSharesAmount;
        for (uint256 id = startId; id <= _endId; id++) {
            uint256 sharesAmount = _testVars.redemptionQueue.getSharesForRequest(id);
            if (_idsToBypass.contains(id)) {
                bypassedSharesAmount += sharesAmount;
                if (sharesAmount > highestBypassedSharesAmount) {
                    highestBypassedSharesAmount = sharesAmount;
                }
            } else {
                address user = _testVars.redemptionQueue.getUserForRequest(id);

                if (user == _testVars.holder1) {
                    holder1RedeemedShares += sharesAmount;
                } else {
                    holder2RedeemedShares += sharesAmount;
                }
            }
        }

        // Snapshot balances
        uint256 preTxHolder1RedemptionAssetBalance = _testVars.redemptionAsset.balanceOf(_testVars.holder1);
        uint256 preTxHolder2RedemptionAssetBalance = _testVars.redemptionAsset.balanceOf(_testVars.holder2);
        uint256 preTxVaultRedemptionAssetBalance = _testVars.redemptionAsset.balanceOf(_testVars.vaultProxyAddress);
        uint256 preTxSharesTotalSupply = IERC20(_testVars.vaultProxyAddress).totalSupply();

        // Update the bypassable threshold to the highest bypassed amount
        vm.prank(_testVars.fundOwner);
        _testVars.redemptionQueue.setBypassableSharesThreshold(highestBypassedSharesAmount);

        // Pre-assert bypassed events
        // Note: it is far more convoluted to test Redeemed() events than to visually inspect them in-prod code
        for (uint256 i; i < _idsToBypass.length; i++) {
            expectEmit(address(_testVars.redemptionQueue));
            emit RequestBypassed(_idsToBypass[i]);
        }

        vm.prank(_testVars.manager);
        _testVars.redemptionQueue.redeemFromQueue({_endId: _endId, _idsToBypass: _idsToBypass});

        // Assert expected redemption asset amounts dispersed to holders
        assertApproxEqAbs(
            _testVars.redemptionAsset.balanceOf(_testVars.holder1),
            preTxHolder1RedemptionAssetBalance + preTxVaultRedemptionAssetBalance * holder1RedeemedShares
                / preTxSharesTotalSupply,
            1,
            "incorrect holder1 balance"
        );
        assertApproxEqAbs(
            _testVars.redemptionAsset.balanceOf(_testVars.holder2),
            preTxHolder2RedemptionAssetBalance + preTxVaultRedemptionAssetBalance * holder2RedeemedShares
                / preTxSharesTotalSupply,
            1,
            "incorrect holder2 balance"
        );

        // Assert remaining shares balance
        assertEq(
            sharesToken.balanceOf(address(_testVars.redemptionQueue)),
            __calcTotalSharesInQueue(_testVars.redemptionQueue),
            "incorrect remaining shares balance"
        );

        // Assert storage
        assertEq(_testVars.redemptionQueue.getNextQueuedId(), _endId + 1, "incorrect nextQueuedId");
        for (uint256 id = startId; id <= _endId; id++) {
            if (_idsToBypass.contains(id)) {
                // bypassed request remains
                assertGt(_testVars.redemptionQueue.getSharesForRequest(id), 0, "bypassed request removed");
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
