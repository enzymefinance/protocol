// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20 as IERC20Prod} from "contracts/external-interfaces/IERC20.sol";
import {
    IAaveV3FlashLoanAssetManager as IAaveV3FlashLoanAssetManagerProd
} from "contracts/persistent/smart-accounts/aave-v3-flash-loan-asset-manager/IAaveV3FlashLoanAssetManager.sol";
import {WrappedSafeERC20 as SafeERC20Prod} from "contracts/utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IAaveV3PoolAddressProvider} from "tests/interfaces/external/IAaveV3PoolAddressProvider.sol";
import {IAaveV3Pool} from "tests/interfaces/external/IAaveV3Pool.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV3FlashLoanAssetManager} from "tests/interfaces/internal/IAaveV3FlashLoanAssetManager.sol";
import {
    ARBITRUM_POOL_ADDRESS_PROVIDER,
    ETHEREUM_POOL_ADDRESS_PROVIDER
} from "tests/tests/protocols/aave/AaveV3Constants.sol";

uint16 constant REFERRAL_CODE = 0;

abstract contract TestBase is IntegrationTest {
    event BorrowedAssetsRecipientSet(address borrowedAssetsRecipient);
    event OwnerSet(address owner);

    IAaveV3Pool aavePool;
    address accountOwner = makeAddr("AccountOwner");
    MockVault vault;
    IAaveV3FlashLoanAssetManager aaveV3FlashLoanAssetManager;

    uint256 repaymentBalanceBuffer = 2;

    // common flash loan request values
    address[] assetAddresses;
    uint256[] loanAmounts;
    uint256[] expectedPremiums;
    uint256[] loanRepaymentAmounts;

    function __initialize(address _poolAddressProviderAddress, address[] memory _assetAddresses, uint256 _chainId)
        internal
    {
        setUpNetworkEnvironment({_chainId: _chainId});

        aavePool = IAaveV3Pool(IAaveV3PoolAddressProvider(_poolAddressProviderAddress).getPool());

        // Deploy a mock vault to use as (1) the borrowed assets recipient and (2) target of Call[] items
        vault = new MockVault();

        // Deploy the account
        aaveV3FlashLoanAssetManager = __deployAccount({_poolAddressProviderAddress: _poolAddressProviderAddress});

        // Initialize the account (as a proxy would)
        aaveV3FlashLoanAssetManager.init({_owner: accountOwner, _borrowedAssetsRecipient: address(vault)});

        // Common flash loan request values
        assetAddresses = _assetAddresses;
        for (uint256 i; i < assetAddresses.length; i++) {
            IERC20 asset = IERC20(assetAddresses[i]);
            uint256 loanAmount = assetUnit(asset) * (7 + i);
            uint256 expectedPremium = loanAmount * aavePool.FLASHLOAN_PREMIUM_TOTAL() / BPS_ONE_HUNDRED_PERCENT;
            uint256 loanRepaymentAmount = loanAmount + expectedPremium;

            loanAmounts.push(loanAmount);
            expectedPremiums.push(expectedPremium);
            loanRepaymentAmounts.push(loanRepaymentAmount);

            // Seed the vault some asset to start with (more than the expected premium + repayment surplus)
            increaseTokenBalance({_token: asset, _to: address(vault), _amount: expectedPremium * (3 + i)});
        }
    }

    // DEPLOYMENT

    function __deployAccount(address _poolAddressProviderAddress)
        internal
        returns (IAaveV3FlashLoanAssetManager account_)
    {
        return IAaveV3FlashLoanAssetManager(
            deployCode("AaveV3FlashLoanAssetManagerLib.sol", abi.encode(_poolAddressProviderAddress, REFERRAL_CODE))
        );
    }

    // HELPERS

    function __flashLoan(uint256 _repaymentSurplus) internal {
        IAaveV3FlashLoanAssetManagerProd.Call[] memory calls =
            new IAaveV3FlashLoanAssetManagerProd.Call[](assetAddresses.length);
        for (uint256 i; i < assetAddresses.length; i++) {
            calls[i] = IAaveV3FlashLoanAssetManagerProd.Call({
                target: address(vault),
                data: abi.encodeWithSelector(
                    vault.transferAsset.selector,
                    assetAddresses[i],
                    aaveV3FlashLoanAssetManager,
                    loanRepaymentAmounts[i] + _repaymentSurplus
                )
            });
        }

        vm.prank(accountOwner);
        aaveV3FlashLoanAssetManager.flashLoan({
            _assets: assetAddresses, _amounts: loanAmounts, _encodedCalls: abi.encode(calls)
        });
    }

    // TESTS

    function test_init_failsWithAlreadyInitialized() public {
        address testInitOwner = makeAddr("TestInitOwner");
        address testInitBorrowedAssetsRecipient = makeAddr("TestInitBorrowedAssetsRecipient");

        // Already initialized during setup, so a 2nd call should fail
        vm.expectRevert(IAaveV3FlashLoanAssetManager.AaveV3FlashLoanAssetManager__Init__AlreadyInitialized.selector);
        aaveV3FlashLoanAssetManager.init({
            _owner: testInitOwner, _borrowedAssetsRecipient: testInitBorrowedAssetsRecipient
        });
    }

    function test_init_success() public {
        address testInitOwner = makeAddr("TestInitOwner");
        address testInitBorrowedAssetsRecipient = makeAddr("TestInitBorrowedAssetsRecipient");

        // Deploy a fresh account, without initializing
        IAaveV3FlashLoanAssetManager testInitAccount = __deployAccount({_poolAddressProviderAddress: address(aavePool)});

        // Pre-assert expected events
        expectEmit(address(testInitAccount));
        emit OwnerSet(testInitOwner);
        expectEmit(address(testInitAccount));
        emit BorrowedAssetsRecipientSet(testInitBorrowedAssetsRecipient);

        // Initialize the new account
        testInitAccount.init({_owner: testInitOwner, _borrowedAssetsRecipient: testInitBorrowedAssetsRecipient});

        // Assert stored values
        assertEq(testInitAccount.getOwner(), testInitOwner, "Unexpected owner");
        assertEq(
            testInitAccount.getBorrowedAssetsRecipient(),
            testInitBorrowedAssetsRecipient,
            "Unexpected borrowedAssetsRecipient"
        );
    }

    function test_executeOperation_failsWithUnauthorizedCaller() public {
        address randomCaller = makeAddr("RandomCaller");

        vm.expectRevert(
            IAaveV3FlashLoanAssetManager.AaveV3FlashLoanAssetManager__ExecuteOperation__UnauthorizedCaller.selector
        );
        vm.prank(randomCaller);
        aaveV3FlashLoanAssetManager.executeOperation({
            _assets: new address[](0),
            _amounts: new uint256[](0),
            _premiums: new uint256[](0),
            _initiator: address(aaveV3FlashLoanAssetManager),
            _params: new bytes(0)
        });
    }

    function test_executeOperation_failsWithUnauthorizedInitiator() public {
        address randomInitiator = makeAddr("RandomInitiator");

        vm.expectRevert(
            IAaveV3FlashLoanAssetManager.AaveV3FlashLoanAssetManager__ExecuteOperation__UnauthorizedInitiator.selector
        );
        vm.prank(address(aavePool));
        aaveV3FlashLoanAssetManager.executeOperation({
            _assets: new address[](0),
            _amounts: new uint256[](0),
            _premiums: new uint256[](0),
            _initiator: randomInitiator,
            _params: new bytes(0)
        });
    }

    function test_flashLoan_failsWithUnauthorizedCaller() public {
        address randomCaller = makeAddr("RandomCaller");

        vm.expectRevert(IAaveV3FlashLoanAssetManager.AaveV3FlashLoanAssetManager__FlashLoan__Unauthorized.selector);
        vm.prank(randomCaller);
        aaveV3FlashLoanAssetManager.flashLoan({
            _assets: new address[](0), _amounts: new uint256[](0), _encodedCalls: new bytes(0)
        });
    }

    function test_flashLoan_failsWithBalanceBufferExceeded() public {
        uint256 loanRepaymentSurplus = repaymentBalanceBuffer + 1;

        // Will revert on the first asset
        uint256 expectedFirstAssetBalance = loanRepaymentAmounts[0] + loanRepaymentSurplus;

        vm.expectRevert(
            abi.encodeWithSelector(
                IAaveV3FlashLoanAssetManager.AaveV3FlashLoanAssetManager__ExecuteOperation__BalanceExceedsRepayment
                .selector,
                expectedFirstAssetBalance
            )
        );

        __flashLoan({_repaymentSurplus: loanRepaymentSurplus});
    }

    function test_flashLoan_successWithExactBalanceBuffer() public {
        uint256 loanRepaymentSurplus = repaymentBalanceBuffer;

        __flashLoan({_repaymentSurplus: loanRepaymentSurplus});

        for (uint256 i; i < assetAddresses.length; i++) {
            IERC20 asset = IERC20(assetAddresses[i]);
            assertEq(
                asset.balanceOf(address(aaveV3FlashLoanAssetManager)),
                loanRepaymentSurplus,
                "Remainder does not match expected surplus balance"
            );
        }
    }

    function test_flashLoan_successWithNoBalanceBuffer() public {
        __flashLoan({_repaymentSurplus: 0});

        for (uint256 i; i < assetAddresses.length; i++) {
            IERC20 asset = IERC20(assetAddresses[i]);
            assertEq(asset.balanceOf(address(aaveV3FlashLoanAssetManager)), 0, "Non-zero remainder");
        }
    }
}

contract TestArbitrum is TestBase {
    function setUp() public override {
        __initialize({
            _poolAddressProviderAddress: ARBITRUM_POOL_ADDRESS_PROVIDER,
            _assetAddresses: toArray(ARBITRUM_USDC),
            _chainId: ARBITRUM_CHAIN_ID
        });
    }
}

contract TestEthereum is TestBase {
    function setUp() public override {
        // Use USDT because it has annoying behavior
        __initialize({
            _poolAddressProviderAddress: ETHEREUM_POOL_ADDRESS_PROVIDER,
            _assetAddresses: toArray(ETHEREUM_USDT, ETHEREUM_WETH),
            _chainId: ETHEREUM_CHAIN_ID
        });
    }
}

contract MockVault {
    using SafeERC20Prod for IERC20Prod;

    function transferAsset(address _assetAddress, address _target, uint256 _amount) external {
        IERC20Prod(_assetAddress).safeTransfer(_target, _amount);
    }
}
