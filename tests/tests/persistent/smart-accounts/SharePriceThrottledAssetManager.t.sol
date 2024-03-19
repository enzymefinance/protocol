// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IFundValueCalculator} from "tests/interfaces/internal/IFundValueCalculator.sol";
import {ISharePriceThrottledAssetManagerLib} from "tests/interfaces/internal/ISharePriceThrottledAssetManagerLib.sol";
import {ISharePriceThrottledAssetManagerFactory} from
    "tests/interfaces/internal/ISharePriceThrottledAssetManagerFactory.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {MockDefaultFundValueCalculator} from "tests/utils/Mocks.sol";

contract SharePriceThrottledAssetManagerTest is IntegrationTest {
    event ThrottleUpdated(uint256 nextCumulativeLoss);

    uint256 oneHundredPercent = WEI_ONE_HUNDRED_PERCENT;

    address accountOwner = makeAddr("AccountOwner");
    address shutdowner = makeAddr("Shutdowner");
    address vaultProxyAddress = makeAddr("VaultProxy");
    uint256 lossTolerance = WEI_ONE_PERCENT;
    uint256 lossTolerancePeriodDuration = 100;

    MockFundValueCalculator mockFundValueCalculator;
    ISharePriceThrottledAssetManagerFactory factory;
    ISharePriceThrottledAssetManagerLib smartAccount;

    function setUp() public override {
        setUpStandaloneEnvironment();

        // Deploy the mock fund value calculator
        mockFundValueCalculator = new MockFundValueCalculator(vaultProxyAddress);

        // Deploy the smart account lib and factory
        address libAddress = __deployLib(address(mockFundValueCalculator));
        factory = __deployFactory({_libAddress: libAddress});

        // Set the initial share value to an arbitrary price that is not 1e18 but still easily divisible
        mockFundValueCalculator.setShareValue(1e12);

        smartAccount =
            __deployAccount({_lossTolerance: lossTolerance, _lossTolerancePeriodDuration: lossTolerancePeriodDuration});

        // Set block timestamp to non-zero value
        vm.warp(123);
    }

    // DEPLOYMENT

    function __deployAccount(uint256 _lossTolerance, uint256 _lossTolerancePeriodDuration)
        internal
        returns (ISharePriceThrottledAssetManagerLib account_)
    {
        return ISharePriceThrottledAssetManagerLib(
            factory.deployProxy({
                _owner: accountOwner,
                _vaultProxyAddress: vaultProxyAddress,
                _lossTolerance: uint64(_lossTolerance),
                _lossTolerancePeriodDuration: uint32(_lossTolerancePeriodDuration),
                _shutdowner: shutdowner
            })
        );
    }

    function __deployFactory(address _libAddress) internal returns (ISharePriceThrottledAssetManagerFactory factory_) {
        return ISharePriceThrottledAssetManagerFactory(
            deployCode("SharePriceThrottledAssetManagerFactory.sol", abi.encode(_libAddress))
        );
    }

    function __deployLib(address _fundValueCalculatorRouterAddress) internal returns (address libAddress_) {
        // Address listId that always returns false
        uint256 gsnTrustedForwardersAddressListId = 0;

        return deployCode(
            "SharePriceThrottledAssetManagerLib.sol",
            abi.encode(
                core.persistent.addressListRegistry,
                gsnTrustedForwardersAddressListId,
                _fundValueCalculatorRouterAddress
            )
        );
    }

    // HELPERS

    function __calcNewLossPercentage(uint256 _prevSharePrice, uint256 _nextSharePrice)
        internal
        view
        returns (uint256 newLoss_)
    {
        return oneHundredPercent * (_prevSharePrice - _nextSharePrice) / _prevSharePrice;
    }

    function __formatSharePriceChangeCall(uint256 _nextSharePrice)
        internal
        view
        returns (ISharePriceThrottledAssetManagerLib.Call[] memory calls_)
    {
        calls_ = new ISharePriceThrottledAssetManagerLib.Call[](1);
        calls_[0] = ISharePriceThrottledAssetManagerLib.Call({
            target: address(mockFundValueCalculator),
            data: abi.encodeWithSelector(MockFundValueCalculator.setShareValue.selector, _nextSharePrice)
        });
    }

    // TESTS

    function test_factory_deployProxy_success() public {
        // TODO: could test events (would need to log as assert post-action)

        __deployAccount({_lossTolerance: lossTolerance, _lossTolerancePeriodDuration: lossTolerancePeriodDuration});

        assertEq(smartAccount.getOwner(), accountOwner);
        assertEq(smartAccount.getVaultProxyAddress(), vaultProxyAddress);
        assertEq(smartAccount.getLossTolerance(), lossTolerance);
        assertEq(smartAccount.getLossTolerancePeriodDuration(), lossTolerancePeriodDuration);
        assertEq(smartAccount.getShutdowner(), shutdowner);
    }

    function test_init_failsWithAlreadyInitialized() public {
        __deployAccount({_lossTolerance: lossTolerance, _lossTolerancePeriodDuration: lossTolerancePeriodDuration});

        vm.expectRevert(ISharePriceThrottledAssetManagerLib.AlreadyInitialized.selector);
        smartAccount.init({
            _owner: accountOwner,
            _vaultProxyAddress: vaultProxyAddress,
            _lossTolerance: 0,
            _lossTolerancePeriodDuration: 0,
            _shutdowner: shutdowner
        });
    }

    function test_init_failsWithOverOneHundredPercentTolerance() public {
        vm.expectRevert(ISharePriceThrottledAssetManagerLib.ExceedsOneHundredPercent.selector);
        __deployAccount({
            _lossTolerance: oneHundredPercent + 1, // TOO HIGH
            _lossTolerancePeriodDuration: lossTolerancePeriodDuration
        });
    }

    function test_executeCalls_failsWithToleranceExceeded() public {
        uint256 prevSharePrice = mockFundValueCalculator.shareValue();
        uint256 toleratedLoss = prevSharePrice * lossTolerance / oneHundredPercent;
        uint256 intolerableLoss = toleratedLoss + 1;
        uint256 nextSharePrice = prevSharePrice - intolerableLoss;
        // Cumulative loss is new loss only
        uint256 cumulativeLossPercentage =
            __calcNewLossPercentage({_prevSharePrice: prevSharePrice, _nextSharePrice: nextSharePrice});

        vm.expectRevert(
            abi.encodeWithSelector(
                ISharePriceThrottledAssetManagerLib.ToleranceExceeded.selector, cumulativeLossPercentage
            )
        );
        vm.prank(accountOwner);
        smartAccount.executeCalls(__formatSharePriceChangeCall(nextSharePrice));
    }

    function test_executeCalls_successWithNoLoss() public {
        uint256 prevSharePrice = mockFundValueCalculator.shareValue();
        uint256 nextSharePrice = prevSharePrice * 2;

        vm.prank(accountOwner);
        smartAccount.executeCalls(__formatSharePriceChangeCall(nextSharePrice));

        // Assert throttle storage
        assertEq(smartAccount.getThrottle().cumulativeLoss, 0);
        assertEq(smartAccount.getThrottle().lastLossTimestamp, 0);
    }

    function test_executeCalls_successWithExactTolerance() public {
        uint256 prevSharePrice = mockFundValueCalculator.shareValue();
        uint256 toleratedLoss = prevSharePrice * lossTolerance / oneHundredPercent;
        uint256 nextSharePrice = prevSharePrice - toleratedLoss;

        __test_executeCalls({_nextSharePrice: nextSharePrice});
    }

    function test_executeCalls_successWithSuccessiveCallsWithinDuration() public {
        // First loss uses 75% of tolerance
        uint256 firstSharePrice = mockFundValueCalculator.shareValue();
        uint256 firstLossPercentage = lossTolerance * 75 / 100;
        uint256 firstLoss = firstSharePrice * firstLossPercentage / oneHundredPercent;
        uint256 secondSharePrice = firstSharePrice - firstLoss;

        __test_executeCalls({_nextSharePrice: secondSharePrice});

        // Warp ahead by 30% of the tolerance duration (replenishing 30% of the tolerated loss)
        uint256 percentageReplenished = oneHundredPercent * 30 / 100;
        skip(lossTolerancePeriodDuration * percentageReplenished / oneHundredPercent);

        // Second loss uses 10% of tolerance
        uint256 secondLossPercentage = lossTolerance * 10 / 100;
        uint256 secondLoss = secondSharePrice * secondLossPercentage / oneHundredPercent;
        uint256 finalSharePrice = secondSharePrice - secondLoss;

        __test_executeCalls({_nextSharePrice: finalSharePrice});

        // Do a manual test of the final expected throttle:
        // 75% - 30% + 10% = 55% of loss tolerance
        assertEq(smartAccount.getThrottle().cumulativeLoss, lossTolerance * 55 / 100);
    }

    function test_executeCalls_successWithSuccessiveCallsBeyondDuration() public {
        // First loss uses 75% of tolerance
        uint256 firstSharePrice = mockFundValueCalculator.shareValue();
        uint256 firstLossPercentage = lossTolerance * 75 / 100;
        uint256 firstLoss = firstSharePrice * firstLossPercentage / oneHundredPercent;
        uint256 secondSharePrice = firstSharePrice - firstLoss;

        __test_executeCalls({_nextSharePrice: secondSharePrice});

        // Warp ahead by 2x of the tolerance duration (replenishing all of the tolerated loss)
        skip(lossTolerancePeriodDuration * 2);

        // Second loss uses 90% of tolerance
        uint256 secondLossPercentage = lossTolerance * 90 / 100;
        uint256 secondLoss = secondSharePrice * secondLossPercentage / oneHundredPercent;
        uint256 finalSharePrice = secondSharePrice - secondLoss;

        __test_executeCalls({_nextSharePrice: finalSharePrice});

        // Do a manual test of the final expected throttle: 90% of loss tolerance
        assertEq(smartAccount.getThrottle().cumulativeLoss, lossTolerance * 90 / 100);
    }

    function __test_executeCalls(uint256 _nextSharePrice) internal {
        uint256 prevSharePrice = mockFundValueCalculator.shareValue();
        uint256 prevThrottlePercentage = smartAccount.getThrottle().cumulativeLoss;
        uint256 prevThrottleTimestamp = smartAccount.getThrottle().lastLossTimestamp;

        uint256 newLossPercentage =
            __calcNewLossPercentage({_prevSharePrice: prevSharePrice, _nextSharePrice: _nextSharePrice});
        uint256 throttleReplenished =
            lossTolerance * (block.timestamp - prevThrottleTimestamp) / lossTolerancePeriodDuration;
        uint256 nextThrottlePercentage;
        if (throttleReplenished > prevThrottlePercentage) {
            nextThrottlePercentage = newLossPercentage;
        } else {
            nextThrottlePercentage = newLossPercentage + prevThrottlePercentage - throttleReplenished;
        }

        // Pre-assert event
        expectEmit(address(smartAccount));
        emit ThrottleUpdated(nextThrottlePercentage);

        vm.prank(accountOwner);
        smartAccount.executeCalls(__formatSharePriceChangeCall(_nextSharePrice));

        // Assert throttle storage
        assertEq(smartAccount.getThrottle().cumulativeLoss, nextThrottlePercentage);
        assertEq(smartAccount.getThrottle().lastLossTimestamp, block.timestamp);
    }

    function test_shutdown_failsWithUnauthorized() public {
        vm.expectRevert(ISharePriceThrottledAssetManagerLib.Unauthorized.selector);
        smartAccount.shutdown();
    }

    function test_shutdown_success() public {
        vm.prank(shutdowner);
        smartAccount.shutdown();

        assertEq(smartAccount.getOwner(), address(0));
    }
}

contract MockFundValueCalculator is MockDefaultFundValueCalculator {
    address internal immutable targetVaultProxyAddress;

    uint256 public shareValue;

    constructor(address _targetVaultProxyAddress) {
        targetVaultProxyAddress = _targetVaultProxyAddress;
    }

    function calcGrossShareValue(address _vaultProxyAddress)
        external
        view
        override
        returns (address denominationAsset_, uint256 grossShareValue_)
    {
        if (_vaultProxyAddress == targetVaultProxyAddress) {
            return (address(0), shareValue);
        }

        revert("MockFundValueCalculator: Unrecognized _vaultProxyAddress");
    }

    function setShareValue(uint256 _shareValue) external {
        shareValue = _shareValue;
    }
}
