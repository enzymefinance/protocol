// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {
    ETHEREUM_SWAP_ROUTER as ETHEREUM_UNISWAP_ROUTER,
    POLYGON_SWAP_ROUTER as POLYGON_UNISWAP_ROUTER,
    UniswapV3Utils
} from "tests/tests/protocols/uniswap/UniswapV3Utils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IDepositWrapper} from "tests/interfaces/internal/IDepositWrapper.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

abstract contract TestBase is IntegrationTest, UniswapV3Utils {
    uint256 internal allowedExchangesListId;
    IDepositWrapper internal depositWrapper;

    address internal sharesBuyer = makeAddr("SharesBuyer");
    IComptrollerLib internal comptrollerProxy;
    IVaultLib internal vaultProxy;

    // Defined by parent contract
    IERC20 internal denominationAsset;
    address internal exchangeAddress;
    address internal exchangeApprovalTargetAddress;

    function setUp() public virtual override {
        // Create an allowedExchanges list, with Uniswap router as the only allowed exchange
        allowedExchangesListId = core.persistent.addressListRegistry.createList({
            _owner: address(this),
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
            _initialItems: toArray(exchangeAddress)
        });

        // Deploy deposit wrapper
        depositWrapper = __deployDepositWrapper();

        // Add depositWrapper to allowed list of buySharesOnBehalf callers
        address fundDeployerOwner = core.release.fundDeployer.getOwner();
        vm.prank(fundDeployerOwner);
        core.release.fundDeployer.registerBuySharesOnBehalfCallers(toArray(address(depositWrapper)));

        // Create a fund denominated in any ERC20 other than the wrapped native asset
        IFundDeployer.ConfigInput memory comptrollerConfig;
        comptrollerConfig.denominationAsset = address(denominationAsset);

        (comptrollerProxy, vaultProxy,) =
            createFund({_fundDeployer: core.release.fundDeployer, _comptrollerConfig: comptrollerConfig});
    }

    // DEPLOYMENT HELPERS

    function __deployDepositWrapper() internal returns (IDepositWrapper) {
        require(allowedExchangesListId != 0, "__deployDepositWrapper: Unset listId");

        bytes memory args = abi.encode(core.persistent.addressListRegistry, allowedExchangesListId, wrappedNativeToken);

        return IDepositWrapper(payable(deployCode("DepositWrapper.sol", args)));
    }

    // MISC HELPERS

    function __calcMinExpectedShares(IERC20 _inputAsset, uint256 _inputAssetAmount)
        internal
        returns (uint256 minExpectedShares_)
    {
        uint256 acceptableSlippageBps = BPS_ONE_PERCENT;
        uint256 sharesUnit = 1 ether;

        uint256 denominationAssetValue = core.release.valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(_inputAsset),
            _amount: _inputAssetAmount,
            _quoteAsset: address(denominationAsset)
        });
        uint256 exactSharesValue = sharesUnit * denominationAssetValue / comptrollerProxy.calcGrossShareValue();
        uint256 acceptableSlippageAbs = exactSharesValue * acceptableSlippageBps / BPS_ONE_HUNDRED_PERCENT;

        return exactSharesValue - acceptableSlippageAbs;
    }
}

abstract contract ExchangeErc20AndBuySharesTest is TestBase {
    // USDT requires safe functions
    using SafeERC20 for IERC20;

    uint256 inputAssetAmount;
    bytes exchangeData;
    uint256 minExpectedShares;

    // Defined by parent contract
    IERC20 inputAsset;
    uint24 uniV3PoolFee;

    function setUp() public virtual override {
        super.setUp();

        inputAssetAmount = assetUnit(inputAsset) * 3;

        // Format exchange data
        address[] memory pathAddresses = toArray(address(inputAsset), address(denominationAsset));
        uint24[] memory pathFees = new uint24[](1);
        pathFees[0] = uniV3PoolFee;

        exchangeData = formatUniswapV3ExactInputData({
            _recipient: address(depositWrapper),
            _pathAddresses: pathAddresses,
            _pathFees: pathFees,
            _outgoingAssetAmount: inputAssetAmount,
            _minIncomingAssetAmount: 0 // No min
        });

        // Calc the min expected shares to receive
        minExpectedShares = __calcMinExpectedShares({_inputAsset: inputAsset, _inputAssetAmount: inputAssetAmount});

        // Seed sharesBuyer with input token and grant allowance to the deposit wrapper
        increaseTokenBalance({_token: inputAsset, _to: sharesBuyer, _amount: assetUnit(inputAsset) * 1000});
        // safeApprove() has multiple calls so must wrap in a prank
        vm.startPrank(sharesBuyer);
        inputAsset.safeApprove(address(depositWrapper), type(uint256).max);
        vm.stopPrank();
    }

    function test_failsWithExchangeMinNotReceived() public {
        uint256 denominationAssetValue = core.release.valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(inputAsset),
            _amount: inputAssetAmount,
            _quoteAsset: address(denominationAsset)
        });
        uint256 reasonableMin = denominationAssetValue * 9 / 10;
        uint256 unreasonableMin = denominationAssetValue * 11 / 10;

        // Should fail with an unreasonable min
        vm.expectRevert("__exchangeAndBuyShares: _exchangeMinReceived not met");
        vm.prank(sharesBuyer);
        depositWrapper.exchangeErc20AndBuyShares({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: minExpectedShares,
            _inputAsset: address(inputAsset),
            _maxInputAssetAmount: inputAssetAmount,
            _exchange: exchangeAddress,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: unreasonableMin // not reasonable
        });

        // Should succeed with a reasonable min
        vm.prank(sharesBuyer);
        depositWrapper.exchangeErc20AndBuyShares({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: minExpectedShares,
            _inputAsset: address(inputAsset),
            _maxInputAssetAmount: inputAssetAmount,
            _exchange: exchangeAddress,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: reasonableMin // reasonable
        });
    }

    function test_failsWithUnallowedExchange() public {
        address badExchange = makeAddr("BadExchange");

        // Should fail with a disallowed selector
        vm.expectRevert("__exchangeAndBuyShares: Unallowed _exchange");
        vm.prank(sharesBuyer);
        depositWrapper.exchangeErc20AndBuyShares({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: minExpectedShares,
            _inputAsset: address(inputAsset),
            _maxInputAssetAmount: inputAssetAmount,
            _exchange: badExchange,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: 0
        });
    }

    function test_success() public {
        vm.prank(sharesBuyer);
        depositWrapper.exchangeErc20AndBuyShares({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: minExpectedShares,
            _inputAsset: address(inputAsset),
            _maxInputAssetAmount: inputAssetAmount,
            _exchange: exchangeAddress,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: 0
        });

        // Assert the sharesBuyer received at least a reasonable min amount of shares
        assertTrue(vaultProxy.balanceOf(sharesBuyer) >= minExpectedShares, "sharesBuyer received too few shares");
    }

    function test_successWithLeftover() public {
        // Specify a too-high amount of the inputAsset relative to the exchange data
        uint256 maxInputAssetAmount = inputAssetAmount + 123;

        uint256 preTxSharesBuyerBal = inputAsset.balanceOf(address(sharesBuyer));

        vm.prank(sharesBuyer);
        depositWrapper.exchangeErc20AndBuyShares({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: 1,
            _inputAsset: address(inputAsset),
            _maxInputAssetAmount: maxInputAssetAmount, // Too high
            _exchange: exchangeAddress,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: 0
        });

        uint256 postTxSharesBuyerBal = inputAsset.balanceOf(address(sharesBuyer));

        // Assert the sharesBuyer received at least a reasonable min amount of shares
        assertTrue(vaultProxy.balanceOf(sharesBuyer) >= minExpectedShares, "sharesBuyer received too few shares");

        // Assert that the sharesBuyer received a refund of the leftover,
        // by asserting that their final balance decreased by the exact amount used
        assertEq(postTxSharesBuyerBal, preTxSharesBuyerBal - inputAssetAmount, "sharesBuyer did not receive refund");
    }
}

abstract contract ExchangeEthAndBuySharesTest is TestBase {
    uint256 nativeAssetAmount;
    bytes exchangeData;
    uint256 minExpectedShares;

    // Defined by parent contract
    uint24 uniV3PoolFee;

    function setUp() public virtual override {
        super.setUp();

        nativeAssetAmount = 5 ether;

        // Format exchange data
        address[] memory pathAddresses = toArray(address(wrappedNativeToken), address(denominationAsset));
        uint24[] memory pathFees = new uint24[](1);
        pathFees[0] = uniV3PoolFee;

        exchangeData = formatUniswapV3ExactInputData({
            _recipient: address(depositWrapper),
            _pathAddresses: pathAddresses,
            _pathFees: pathFees,
            _outgoingAssetAmount: nativeAssetAmount,
            _minIncomingAssetAmount: 0 // No min
        });

        // Calc the min expected shares to receive
        minExpectedShares =
            __calcMinExpectedShares({_inputAsset: wrappedNativeToken, _inputAssetAmount: nativeAssetAmount});

        // Seed sharesBuyer with native asset
        increaseNativeAssetBalance({_to: sharesBuyer, _amount: 1000 ether});
    }

    // Failure cases tested in Erc20 tests

    function test_success() public {
        vm.prank(sharesBuyer);
        depositWrapper.exchangeEthAndBuyShares{value: nativeAssetAmount}({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: minExpectedShares,
            _exchange: exchangeAddress,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: 0
        });

        // Assert the sharesBuyer received at least a reasonable min amount of shares
        assertTrue(vaultProxy.balanceOf(sharesBuyer) >= minExpectedShares, "sharesBuyer received too few shares");
    }

    function test_successWithLeftover() public {
        // Specify a too-high amount of the inputAsset relative to the exchange data
        uint256 maxNativeAssetAmount = nativeAssetAmount + 123;

        uint256 preTxSharesBuyerBal = sharesBuyer.balance;

        vm.prank(sharesBuyer);
        depositWrapper.exchangeEthAndBuyShares{value: maxNativeAssetAmount}({
            _comptrollerProxy: address(comptrollerProxy),
            _minSharesQuantity: 1,
            _exchange: exchangeAddress,
            _exchangeApproveTarget: exchangeApprovalTargetAddress,
            _exchangeData: exchangeData,
            _exchangeMinReceived: 0
        });

        uint256 postTxSharesBuyerBal = sharesBuyer.balance;

        // Assert the sharesBuyer received at least a reasonable min amount of shares
        assertTrue(vaultProxy.balanceOf(sharesBuyer) >= minExpectedShares, "sharesBuyer received too few shares");

        // Assert that the sharesBuyer received a refund of the leftover,
        // by asserting that their final balance decreased by the exact amount used
        assertEq(postTxSharesBuyerBal, preTxSharesBuyerBal - nativeAssetAmount, "sharesBuyer did not receive refund");
    }

    function test_successWithNativeAssetDenomination() public {
        // Create new fund that is denominated in the wrapped native asset
        IFundDeployer.ConfigInput memory comptrollerConfig;
        comptrollerConfig.denominationAsset = address(wrappedNativeToken);

        (IComptrollerLib nativeAssetComptrollerProxy, IVaultLib nativeAssetVaultProxy,) =
            createFund({_fundDeployer: core.release.fundDeployer, _comptrollerConfig: comptrollerConfig});

        uint256 inputAmount = 3 ether;
        uint256 expectedShares = inputAmount; // 1:1

        vm.prank(sharesBuyer);
        // All exchange data is empty to signal wrapping native asset only
        depositWrapper.exchangeEthAndBuyShares{value: inputAmount}({
            _comptrollerProxy: address(nativeAssetComptrollerProxy),
            _minSharesQuantity: 1,
            _exchange: address(0),
            _exchangeApproveTarget: address(0),
            _exchangeData: "",
            _exchangeMinReceived: 0
        });

        // Assert the sharesBuyer received shares in the fund
        assertEq(
            nativeAssetVaultProxy.balanceOf(sharesBuyer), expectedShares, "sharesBuyer did not receive expected shares"
        );
    }
}

// TEST SUITES

contract EthereumExchangeErc20AndBuySharesTest is ExchangeErc20AndBuySharesTest {
    function setUp() public override {
        setUpMainnetEnvironment();

        denominationAsset = getCoreToken("USDC");
        // Use USDT since it has some idiosyncrasies
        inputAsset = getCoreToken("USDT");

        // Exchange params
        exchangeAddress = ETHEREUM_UNISWAP_ROUTER;
        exchangeApprovalTargetAddress = exchangeAddress;
        uniV3PoolFee = 100; // 0.01% for USDC-USDT

        super.setUp();
    }
}

contract EthereumExchangeEthAndBuySharesTest is ExchangeEthAndBuySharesTest {
    function setUp() public override {
        setUpMainnetEnvironment();

        denominationAsset = getCoreToken("USDC");

        // Exchange params
        exchangeAddress = ETHEREUM_UNISWAP_ROUTER;
        exchangeApprovalTargetAddress = exchangeAddress;
        uniV3PoolFee = 500; // 0.05% for USDC-WETH

        super.setUp();
    }
}

contract PolygonExchangeErc20AndBuySharesTest is ExchangeErc20AndBuySharesTest {
    function setUp() public override {
        setUpPolygonEnvironment();

        denominationAsset = getCoreToken("WBTC");
        inputAsset = getCoreToken("USDC");

        // Exchange params
        exchangeAddress = POLYGON_UNISWAP_ROUTER;
        exchangeApprovalTargetAddress = exchangeAddress;
        uniV3PoolFee = 3000; // 0.3% for WBTC-USDC

        super.setUp();
    }
}

contract PolygonExchangeEthAndBuySharesTest is ExchangeEthAndBuySharesTest {
    function setUp() public override {
        setUpPolygonEnvironment();

        denominationAsset = getCoreToken("WBTC");

        // Exchange params
        exchangeAddress = POLYGON_UNISWAP_ROUTER;
        exchangeApprovalTargetAddress = exchangeAddress;
        uniV3PoolFee = 500; // 0.05% for WBTC-WMATIC

        super.setUp();
    }
}
