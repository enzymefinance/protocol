// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {ISingleAssetDepositQueueLib} from "tests/interfaces/internal/ISingleAssetDepositQueueLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {Uint256ArrayLib} from "tests/utils/libs/Uint256ArrayLib.sol";

contract SingleAssetDepositQueueTest is IntegrationTest {
    using Uint256ArrayLib for uint256[];

    EnzymeVersion internal version = EnzymeVersion.Current;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal vaultProxyAddress;

    ISingleAssetDepositQueueLib internal depositQueue;

    //==================================================================================================================
    // Events
    //==================================================================================================================

    event Deposited(uint256 id, uint256 sharesAmountReceived);
    event DepositorAllowlistIdSet(uint64 depositorAllowlistId);
    event DepositRequestAdded(uint88 id, address user, uint128 depositAssetAmount, uint96 canCancelTime);
    event Initialized(address vaultProxy, IERC20 depositAsset);
    event ManagerAdded(address user);
    event ManagerRemoved(address user);
    event MinDepositAssetAmountSet(uint128 minDepositAssetAmount);
    event MinRequestTimeSet(uint64 minRequestTime);
    event RequestBypassed(uint88 id);
    event RequestCanceled(uint88 id);
    event Shutdown();

    function setUp() public override {
        setUpStandaloneEnvironment();

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        depositQueue = __deployLib();
    }

    //==================================================================================================================
    // Deployment helpers
    //==================================================================================================================

    function __deployLib() internal returns (ISingleAssetDepositQueueLib lib_) {
        // Address listId that always returns false
        uint256 gsnTrustedForwardersAddressListId = 0;

        bytes memory args = abi.encode(
            core.persistent.addressListRegistry, core.persistent.globalConfigProxy, gsnTrustedForwardersAddressListId
        );

        return ISingleAssetDepositQueueLib(deployCode("SingleAssetDepositQueueLib.sol", args));
    }

    //==================================================================================================================
    // Misc helpers
    //==================================================================================================================

    function __calcTotalAssetsInQueue() internal view returns (uint256 totalAssets_) {
        uint256 queueEndId = depositQueue.getNextNewId() - 1;
        for (uint256 id = 0; id <= queueEndId; id++) {
            totalAssets_ += depositQueue.getRequest(id).depositAssetAmount;
        }
    }

    //==================================================================================================================
    // Test helpers
    //==================================================================================================================

    function __setup_queueAndDepositors(bool _fillQueue) public returns (address depositor1_, address depositor2_) {
        return __setup_queueAndDepositors({_fillQueue: _fillQueue, _minRequestTime: 0});
    }

    function __setup_queueAndDepositors(bool _fillQueue, uint64 _minRequestTime)
        public
        returns (address depositor1_, address depositor2_)
    {
        IERC20 depositAsset = IERC20(IComptrollerLib(comptrollerProxyAddress).getDenominationAsset());

        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(depositAsset),
            _minDepositAssetAmount: 0,
            _minRequestTime: _minRequestTime,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        // Define depositors and get them some deposit asset
        address depositor1 = makeAddr("depositor1");
        address depositor2 = makeAddr("depositor2");
        increaseTokenBalance({_token: depositAsset, _to: depositor1, _amount: assetUnit(depositAsset) * 1000});
        increaseTokenBalance({_token: depositAsset, _to: depositor2, _amount: assetUnit(depositAsset) * 600});

        // Grant deposit asset allowance to the depositQueue for the depositors
        vm.prank(depositor1);
        depositAsset.approve(address(depositQueue), UINT256_MAX);
        vm.prank(depositor2);
        depositAsset.approve(address(depositQueue), UINT256_MAX);

        // Fill queue with requests from each user
        if (_fillQueue) {
            uint128 depositorAssetBalance1 = uint128(depositAsset.balanceOf(depositor1));
            uint128 depositorAssetBalance2 = uint128(depositAsset.balanceOf(depositor2));

            vm.startPrank(depositor1);
            depositQueue.requestDeposit(depositorAssetBalance1 / 3);
            depositQueue.requestDeposit(depositorAssetBalance1 / 5);
            depositQueue.requestDeposit(depositorAssetBalance1 / 7);
            depositQueue.requestDeposit(depositorAssetBalance1 / 10);
            vm.stopPrank();

            vm.startPrank(depositor2);
            depositQueue.requestDeposit(depositorAssetBalance2 / 4);
            depositQueue.requestDeposit(depositorAssetBalance2 / 6);
            depositQueue.requestDeposit(depositorAssetBalance2 / 8);
            depositQueue.requestDeposit(depositorAssetBalance2 / 10);
            vm.stopPrank();
        }

        return (depositor1, depositor2);
    }

    //==================================================================================================================
    // Tests init
    //==================================================================================================================

    function test_init_success() public {
        address[] memory managers = toArray(makeAddr("first manager"), makeAddr("second manager"));

        IERC20 depositAsset = createTestToken("DepositAsset");
        uint128 minDepositAssetAmount = 1e18;
        uint64 minRequestTime = 123;
        uint64 depositorAllowlistId = 15;

        for (uint256 i = 0; i < managers.length; i++) {
            expectEmit(address(depositQueue));
            emit ManagerAdded(managers[i]);
        }

        expectEmit(address(depositQueue));
        emit MinDepositAssetAmountSet(minDepositAssetAmount);

        expectEmit(address(depositQueue));
        emit MinRequestTimeSet(minRequestTime);

        expectEmit(address(depositQueue));
        emit DepositorAllowlistIdSet(depositorAllowlistId);

        expectEmit(address(depositQueue));
        emit Initialized(vaultProxyAddress, depositAsset);

        depositQueue.init({
            _managers: managers,
            _depositAsset: address(depositAsset),
            _minDepositAssetAmount: minDepositAssetAmount,
            _vaultProxy: vaultProxyAddress,
            _minRequestTime: minRequestTime,
            _depositorAllowlistId: depositorAllowlistId
        });

        assertEq(depositQueue.getVaultProxy(), vaultProxyAddress, "Unexpected vaultProxy");
        assertEq(depositQueue.getDepositorAllowlistId(), depositorAllowlistId, "Unexpected depositorAllowlistId");
        assertEq(depositQueue.getMinDepositAssetAmount(), minDepositAssetAmount, "Unexpected minDepositAssetAmount");
        assertEq(depositQueue.getMinRequestTime(), minRequestTime, "Unexpected minRequestTime");
        for (uint256 i = 0; i < managers.length; i++) {
            assertTrue(depositQueue.isManager(managers[i]), "Manager not added");
        }
    }

    function test_init_failsWithAlreadyInitialized() public {
        address mockedVaultProxy = makeAddr("VaultProxy");

        depositQueue.init({
            _vaultProxy: mockedVaultProxy,
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__Init__AlreadyInitialized.selector);
        depositQueue.init({
            _vaultProxy: mockedVaultProxy,
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });
    }

    function test_init_failsWithUndefinedVaultProxy() public {
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__Init__UndefinedVaultProxy.selector);
        depositQueue.init({
            _vaultProxy: address(0),
            _depositAsset: makeAddr("depositAsset"),
            _managers: toArray(makeAddr("manager")),
            _minDepositAssetAmount: 1,
            _minRequestTime: 1,
            _depositorAllowlistId: 1
        });
    }

    //==================================================================================================================
    // Tests config
    //==================================================================================================================

    function test_addManagers_success() public {
        address[] memory managers = toArray(makeAddr("first manager"));

        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        for (uint256 i = 0; i < managers.length; i++) {
            expectEmit(address(depositQueue));
            emit ManagerAdded(managers[i]);
        }

        vm.prank(fundOwner);
        depositQueue.addManagers(managers);

        for (uint256 i = 0; i < managers.length; i++) {
            assertTrue(depositQueue.isManager(managers[i]), "Manager not added");
        }
    }

    function test_addManagers_failsAlreadyManager() public {
        address[] memory managers = toArray(makeAddr("first manager"));
        depositQueue.init({
            _managers: managers,
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.expectRevert(
            abi.encodeWithSelector(
                ISingleAssetDepositQueueLib.SingleAssetDepositQueue__AddManager__AlreadyManager.selector
            )
        );

        vm.prank(fundOwner);
        depositQueue.addManagers(managers);
    }

    function test_addManagers_failsNotOwner() public {
        address manager = makeAddr("manager");

        depositQueue.init({
            _managers: toArray(manager),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(manager);
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyOwner__Unauthorized.selector);
        depositQueue.addManagers(new address[](0));
    }

    function test_removeManagers_success() public {
        address[] memory managers = toArray(makeAddr("first manager"), makeAddr("second manager"));
        depositQueue.init({
            _managers: managers,
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        for (uint256 i = 0; i < managers.length; i++) {
            expectEmit(address(depositQueue));
            emit ManagerRemoved(managers[i]);
        }

        vm.prank(fundOwner);
        depositQueue.removeManagers(managers);

        for (uint256 i = 0; i < managers.length; i++) {
            assertFalse(depositQueue.isManager(managers[i]), "Manager not removed");
        }
    }

    function test_removeManagers_failsNotOwner() public {
        address manager = makeAddr("manager");

        depositQueue.init({
            _managers: toArray(manager),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(manager);
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyOwner__Unauthorized.selector);
        depositQueue.removeManagers(new address[](0));
    }

    function test_removeManagers_failsNotManager() public {
        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        address[] memory managers = toArray(makeAddr("first manager"));

        vm.expectRevert(
            abi.encodeWithSelector(
                ISingleAssetDepositQueueLib.SingleAssetDepositQueue__RemoveManager__NotManager.selector
            )
        );

        vm.prank(fundOwner);
        depositQueue.removeManagers(managers);
    }

    function test_setDepositorAllowlistId_success() public {
        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        uint64 depositorAllowlistId = 1;

        expectEmit(address(depositQueue));
        emit DepositorAllowlistIdSet(depositorAllowlistId);

        vm.prank(fundOwner);
        depositQueue.setDepositorAllowlistId(depositorAllowlistId);

        assertEq(depositQueue.getDepositorAllowlistId(), depositorAllowlistId, "DepositorAllowlistId not set");
    }

    function test_setDepositorAllowlistId_failsNotOwner() public {
        address manager = makeAddr("manager");

        depositQueue.init({
            _managers: toArray(manager),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(manager);
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyOwner__Unauthorized.selector);
        depositQueue.setDepositorAllowlistId(0);
    }

    function test_setMinDepositAssetAmount_success() public {
        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        uint64 minDepositAssetAmount = 1e18;

        expectEmit(address(depositQueue));
        emit MinDepositAssetAmountSet(minDepositAssetAmount);

        vm.prank(fundOwner);
        depositQueue.setMinDepositAssetAmount(minDepositAssetAmount);

        assertEq(depositQueue.getMinDepositAssetAmount(), minDepositAssetAmount, "MinDepositAssetAmount not set");
    }

    function test_setMinDepositAssetAmount_failsNotOwner() public {
        address manager = makeAddr("manager");

        depositQueue.init({
            _managers: toArray(manager),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(manager);
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyOwner__Unauthorized.selector);
        depositQueue.setMinDepositAssetAmount(0);
    }

    function test_setMinRequestTime_success() public {
        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        uint64 minRequestTime = 1e18;

        expectEmit(address(depositQueue));
        emit MinRequestTimeSet(minRequestTime);

        vm.prank(fundOwner);
        depositQueue.setMinRequestTime(minRequestTime);

        assertEq(depositQueue.getMinRequestTime(), minRequestTime, "MinRequestTime not set");
    }

    function test_setMinRequestTime_failsNotOwner() public {
        address manager = makeAddr("manager");

        depositQueue.init({
            _managers: toArray(manager),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(manager);
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyOwner__Unauthorized.selector);

        depositQueue.setMinRequestTime(0);
    }

    function test_shutdown_success() public {
        depositQueue.init({
            _vaultProxy: vaultProxyAddress,
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        expectEmit(address(depositQueue));
        emit Shutdown();

        vm.prank(fundOwner);
        depositQueue.shutdown();

        assertTrue(depositQueue.queueIsShutdown(), "not shutdown");
    }

    function test_shutdown_failsNotOwner() public {
        address manager = makeAddr("manager");

        depositQueue.init({
            _managers: toArray(manager),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(manager);
        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyOwner__Unauthorized.selector);
        depositQueue.shutdown();
    }

    function test_shutdown_failsNotShutdown() public {
        depositQueue.init({
            _managers: new address[](0),
            _depositAsset: address(0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _vaultProxy: vaultProxyAddress,
            _depositorAllowlistId: 0
        });

        vm.prank(fundOwner);
        depositQueue.shutdown();

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__NotShutdown__Shutdown.selector);
        vm.prank(fundOwner);
        depositQueue.shutdown();
    }

    //==================================================================================================================
    // Tests deposit request flow
    //==================================================================================================================

    // Tests:
    // - partial queue deposit
    // - full queue deposit
    // - bypassed items
    function test_depositFromQueue_success() public {
        (address depositor1, address depositor2) = __setup_queueAndDepositors({_fillQueue: true});

        address manager = makeAddr("manager");

        vm.prank(fundOwner);
        depositQueue.addManagers(toArray(manager));

        uint88 queueEnd = depositQueue.getNextNewId() - 1;

        // Sanity check that there are enough requests in the queue for the multiple deposits
        assertGt(queueEnd, 6, "not enough requests in queue");

        // Partial deposit at start of queue; bypass final item
        {
            uint88 endId = 2;
            uint256[] memory idsToBypass = toArray(endId);

            __test_depositFromQueue(
                DepositFromQueueParams({
                    depositor1: depositor1,
                    depositor2: depositor2,
                    idsToBypass: idsToBypass,
                    endId: endId,
                    manager: manager
                })
            );
        }

        // Full deposit of remaining items; bypass a couple items in the middle
        {
            uint88 endId = queueEnd;
            uint256[] memory idsToBypass = toArray(endId - 2, endId - 1);

            __test_depositFromQueue(
                DepositFromQueueParams({
                    depositor1: depositor1,
                    depositor2: depositor2,
                    idsToBypass: idsToBypass,
                    endId: endId,
                    manager: manager
                })
            );
        }
    }

    function test_depositFromQueue_successWithCanceledRequest() public {
        (address depositor1, address depositor2) = __setup_queueAndDepositors({_fillQueue: true});

        address manager = makeAddr("manager");

        vm.prank(fundOwner);
        depositQueue.addManagers(toArray(manager));

        uint88 queueEnd = depositQueue.getNextNewId() - 1;

        // Sanity check that there are enough requests in the queue for the multiple deposits
        assertGt(queueEnd, 6, "not enough requests in queue");

        uint64 cancelRequest = 2;

        vm.prank(depositor1);
        depositQueue.cancelRequest(cancelRequest);

        uint256[] memory idsToBypass = toArray(queueEnd);

        __test_depositFromQueue(
            DepositFromQueueParams({
                depositor1: depositor1,
                depositor2: depositor2,
                idsToBypass: idsToBypass,
                endId: queueEnd,
                manager: manager
            })
        );
    }

    struct DepositFromQueueSnapshot {
        uint256 preTxDepositor1DepositSharesBalance;
        uint256 preTxDepositor2DepositSharesBalance;
        uint256 preTxVaultSharesBalance;
    }

    struct DepositFromQueueParams {
        address depositor1;
        address depositor2;
        address manager;
        uint256[] idsToBypass;
        uint88 endId;
    }

    function __test_depositFromQueue(DepositFromQueueParams memory _params) internal {
        IERC20 sharesToken = IERC20(vaultProxyAddress);
        uint256 startId = depositQueue.getNextQueuedId();

        IERC20 depositAsset = IERC20(depositQueue.getDepositAsset());

        // Calc expected redeemed and bypassed shares amounts
        uint256 depositor1DepositedAssets;
        uint256 depositor2DepositedAssets;

        for (uint256 id = startId; id <= _params.endId; id++) {
            ISingleAssetDepositQueueLib.Request memory request = depositQueue.getRequest(id);

            if (!_params.idsToBypass.contains(id)) {
                if (request.user == _params.depositor1) {
                    depositor1DepositedAssets += request.depositAssetAmount;
                } else {
                    depositor2DepositedAssets += request.depositAssetAmount;
                }
            }
        }
        uint256 totalDepositAssetAmount = depositor1DepositedAssets + depositor2DepositedAssets;

        {
            // Snapshot balances

            DepositFromQueueSnapshot memory snapshot = DepositFromQueueSnapshot({
                preTxDepositor1DepositSharesBalance: sharesToken.balanceOf(_params.depositor1),
                preTxDepositor2DepositSharesBalance: sharesToken.balanceOf(_params.depositor2),
                preTxVaultSharesBalance: sharesToken.totalSupply()
            });

            // Pre-assert bypassed events
            // Note: it is far more convoluted to test Redeemed() events than to visually inspect them in-prod code
            for (uint88 i; i < _params.idsToBypass.length; i++) {
                expectEmit(address(depositQueue));
                emit RequestBypassed(uint88(_params.idsToBypass[i]));
            }

            vm.prank(_params.manager);
            depositQueue.depositFromQueue({_endId: _params.endId, _idsToBypass: _params.idsToBypass});

            uint256 sharesMinted = sharesToken.totalSupply() - snapshot.preTxVaultSharesBalance;

            // Assert expected shares dispersed to depositors
            assertApproxEqAbs(
                sharesToken.balanceOf(_params.depositor1),
                snapshot.preTxDepositor1DepositSharesBalance
                    + sharesMinted * depositor1DepositedAssets / totalDepositAssetAmount,
                1,
                "incorrect depositor1 balance"
            );
            assertApproxEqAbs(
                sharesToken.balanceOf(_params.depositor2),
                snapshot.preTxDepositor2DepositSharesBalance
                    + sharesMinted * depositor2DepositedAssets / totalDepositAssetAmount,
                1,
                "incorrect depositor2 balance"
            );
        }

        // Assert remaining deposit asset balance
        assertEq(
            depositAsset.balanceOf(address(depositQueue)),
            __calcTotalAssetsInQueue(),
            "incorrect remaining shares balance"
        );

        // Assert storage
        assertEq(depositQueue.getNextQueuedId(), _params.endId + 1, "incorrect nextQueuedId");
        for (uint256 id = startId; id <= _params.endId; id++) {
            ISingleAssetDepositQueueLib.Request memory request = depositQueue.getRequest(id);

            if (_params.idsToBypass.contains(id)) {
                // bypassed request remains
                assertGt(request.depositAssetAmount, 0, "bypassed request removed");
            } else {
                // executed or cancel request removed
                assertEq(request.depositAssetAmount, 0, "non-zero shares in request");
                assertEq(request.user, address(0), "non-zero user in request");
                assertEq(request.canCancelTime, 0, "non-zero canCancelTime in request");
            }
        }
    }

    function test_depositFromQueue_failsNotManagerOrOwner() public {
        depositQueue.init({
            _vaultProxy: vaultProxyAddress,
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__OnlyManagerOrOwner__Unauthorized.selector);
        depositQueue.depositFromQueue({_endId: 0, _idsToBypass: new uint256[](0)});
    }

    function test_depositFromQueue_failsQueueShutdown() public {
        depositQueue.init({
            _vaultProxy: vaultProxyAddress,
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        vm.prank(fundOwner);
        depositQueue.shutdown();

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__NotShutdown__Shutdown.selector);
        depositQueue.depositFromQueue({_endId: 0, _idsToBypass: new uint256[](0)});
    }

    function test_depositFromQueue_failsWithEndItOutOfRange() public {
        __setup_queueAndDepositors({_fillQueue: true});

        vm.prank(fundOwner);

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__DepositFromQueue__OutOfRange.selector);
        depositQueue.depositFromQueue({_endId: 8, _idsToBypass: new uint256[](0)});
    }

    function test_requestDeposit_successMultipleRequests() public {
        (address depositor1, address depositor2) = __setup_queueAndDepositors({_fillQueue: false});

        // Do deposits requests from 2 different users, with 2 requests from the same user
        __test_requestDeposit({_depositor: depositor1, _assetAmount: 123});
        __test_requestDeposit({_depositor: depositor2, _assetAmount: 456});
        __test_requestDeposit({_depositor: depositor1, _assetAmount: 789});
    }

    function test_requestDeposit_successDepositorIsAllowlisted() public {
        (address depositor1,) = __setup_queueAndDepositors({_fillQueue: false});

        uint64 listId = uint64(
            core.persistent.addressListRegistry.createList({
                _owner: fundOwner,
                _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
                _initialItems: toArray(depositor1)
            })
        );

        vm.prank(fundOwner);
        depositQueue.setDepositorAllowlistId(listId);

        __test_requestDeposit({_depositor: depositor1, _assetAmount: 123});
    }

    function test_requestDeposit_successWithMinDepositAssetAmount() public {
        (address depositor1,) = __setup_queueAndDepositors({_fillQueue: false});

        uint128 minDepositAssetAmount = 100;

        vm.prank(fundOwner);
        depositQueue.setMinDepositAssetAmount(minDepositAssetAmount);

        __test_requestDeposit({_depositor: depositor1, _assetAmount: minDepositAssetAmount});
    }

    function __test_requestDeposit(address _depositor, uint128 _assetAmount) internal {
        IERC20 depositAsset = IERC20(depositQueue.getDepositAsset());

        uint88 preTxNextNewId = depositQueue.getNextNewId();
        uint88 preTxNextQueuedId = depositQueue.getNextQueuedId();
        uint256 preTxDepositAssetBalance = depositAsset.balanceOf(address(depositQueue));

        uint96 canCancelTime = uint96(block.timestamp + depositQueue.getMinRequestTime());

        // Pre-assert event
        expectEmit(address(depositQueue));
        emit DepositRequestAdded(preTxNextNewId, _depositor, _assetAmount, canCancelTime);

        // Request a deposit
        vm.prank(_depositor);
        uint256 id = depositQueue.requestDeposit(_assetAmount);
        assertEq(id, preTxNextNewId, "incorrect id");

        ISingleAssetDepositQueueLib.Request memory request = depositQueue.getRequest(id);
        // Assert deposit request storage
        assertEq(request.depositAssetAmount, _assetAmount, "incorrect shares");
        assertEq(request.user, _depositor, "incorrect user");
        assertEq(request.canCancelTime, canCancelTime, "incorrect requestTime");

        // Assert queue pointers (nextNewId incremented, nextQueuedId unchanged)
        assertEq(depositQueue.getNextNewId(), preTxNextNewId + 1, "incorrect nextNewId");
        assertEq(depositQueue.getNextQueuedId(), preTxNextQueuedId, "incorrect nextQueuedId");

        // Assert deposit asset transferred to the depositQueue
        assertEq(
            depositAsset.balanceOf(address(depositQueue)),
            preTxDepositAssetBalance + _assetAmount,
            "incorrect deposit asset balance"
        );
    }

    function test_requestDeposit_failsDepositAmountIsZero() public {
        depositQueue.init({
            _vaultProxy: makeAddr("vaultProxy"),
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        vm.expectRevert(
            ISingleAssetDepositQueueLib.SingleAssetDepositQueue__RequestDeposit__DepositAmountEqualsToZero.selector
        );
        depositQueue.requestDeposit(0);
    }

    function test_requestDeposit_failsDepositorIsNotAllowlisted() public {
        uint64 listId = uint64(
            core.persistent.addressListRegistry.createList({
                _owner: fundOwner,
                _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
                _initialItems: new address[](0)
            })
        );

        depositQueue.init({
            _vaultProxy: makeAddr("vaultProxy"),
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: listId
        });

        vm.expectRevert(
            ISingleAssetDepositQueueLib.SingleAssetDepositQueue__RequestDeposit__DepositorIsNotAllowlisted.selector
        );
        depositQueue.requestDeposit(1);
    }

    function test_requestDeposit_failsTooLowDepositAssetAmount() public {
        uint128 minDepositAssetAmount = 10;

        depositQueue.init({
            _vaultProxy: makeAddr("vaultProxy"),
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: minDepositAssetAmount,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        uint128 depositAssetAmount = minDepositAssetAmount - 1;

        vm.expectRevert(
            abi.encodeWithSelector(
                ISingleAssetDepositQueueLib.SingleAssetDepositQueue__RequestDeposit__TooLowDepositAmount.selector
            )
        );
        depositQueue.requestDeposit(depositAssetAmount);
    }

    function test_requestDeposit_failsQueueShutdown() public {
        depositQueue.init({
            _vaultProxy: vaultProxyAddress,
            _depositAsset: address(0),
            _managers: new address[](0),
            _minDepositAssetAmount: 0,
            _minRequestTime: 0,
            _depositorAllowlistId: 0
        });

        vm.prank(fundOwner);
        depositQueue.shutdown();

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__NotShutdown__Shutdown.selector);
        depositQueue.requestDeposit(0);
    }

    function test_cancelRequest_success() public {
        __setup_queueAndDepositors({_fillQueue: true});

        __test_cancelRequest(1);
    }

    function test_cancelRequest_successWithMinRequestTimeSet() public {
        uint64 minRequestTime = 10;

        __setup_queueAndDepositors({_fillQueue: true, _minRequestTime: minRequestTime});

        skip(minRequestTime);

        __test_cancelRequest(1);
    }

    function test_cancelRequest_successWithMinRequestTimeNotElapsedAndQueueShutdown() public {
        __setup_queueAndDepositors({_fillQueue: true, _minRequestTime: 10});

        vm.prank(fundOwner);
        depositQueue.shutdown();

        __test_cancelRequest(1);
    }

    function test_cancelRequest_successWithMinRequestTimeNotElapsedAndRequestBypassed() public {
        __setup_queueAndDepositors({_fillQueue: true, _minRequestTime: 10});

        uint88 requestIdToBypass = 1;

        vm.prank(fundOwner);
        depositQueue.depositFromQueue({_endId: 2, _idsToBypass: toArray(requestIdToBypass)});

        __test_cancelRequest(requestIdToBypass);
    }

    function __test_cancelRequest(uint88 _id) internal {
        ISingleAssetDepositQueueLib.Request memory preRequest = depositQueue.getRequest(_id);

        IERC20 depositAsset = IERC20(depositQueue.getDepositAsset());

        uint256 preTxRedeemerSharesBalance = depositAsset.balanceOf(preRequest.user);

        // Pre-assert event
        expectEmit(address(depositQueue));
        emit RequestCanceled(_id);

        vm.prank(preRequest.user);
        depositQueue.cancelRequest(_id);

        ISingleAssetDepositQueueLib.Request memory postRequest = depositQueue.getRequest(_id);
        // Assert storage: request removed
        assertEq(postRequest.user, address(0), "incorrect user");
        assertEq(postRequest.depositAssetAmount, 0, "incorrect depositAssetAmount");
        assertEq(postRequest.canCancelTime, 0, "incorrect canCancelTime");

        // Assert shares transferred back to the redeemer
        assertEq(
            depositAsset.balanceOf(preRequest.user),
            preTxRedeemerSharesBalance + preRequest.depositAssetAmount,
            "incorrect shares balance"
        );
    }

    function test_cancelRequest_failsWithMinRequestTimeNotElapsed() public {
        (address depositor1,) = __setup_queueAndDepositors({_fillQueue: true, _minRequestTime: 1});
        uint88 id = 1;

        vm.expectRevert(
            ISingleAssetDepositQueueLib.SingleAssetDepositQueue__CancelRequest__MinRequestTimeNotElapsed.selector
        );
        vm.prank(depositor1);
        depositQueue.cancelRequest(id);
    }

    function test_cancelRequest_failsWithUnauthorized() public {
        __setup_queueAndDepositors({_fillQueue: true});
        uint88 id = 1;
        address randomCaller = makeAddr("RandomCaller");

        vm.expectRevert(ISingleAssetDepositQueueLib.SingleAssetDepositQueue__CancelRequest__Unauthorized.selector);
        vm.prank(randomCaller);
        depositQueue.cancelRequest(id);
    }
}
