// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20 as IERC20Prod} from "contracts/external-interfaces/IERC20.sol";
import {WrappedSafeERC20 as SafeERC20Prod} from "contracts/utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IMorphoBlue} from "tests/interfaces/external/IMorphoBlue.sol";
import {IMorphoBlueFlashLoanAssetManager} from "tests/interfaces/internal/IMorphoBlueFlashLoanAssetManager.sol";

address constant ETHEREUM_MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;

abstract contract TestBase is IntegrationTest {
    // Events: MorphoBlueFlashLoanAssetManager
    event BorrowedAssetsRecipientSet(address borrowedAssetsRecipient);
    event OwnerSet(address owner);
    // Events: MockVault
    event MockVaultTransferAsset(address assetAddress, address target, uint256 amount);

    IMorphoBlue morpho;

    address accountOwner = makeAddr("AccountOwner");
    MockVault vault;
    IMorphoBlueFlashLoanAssetManager morphoFlashLoanAssetManager;

    IERC20 borrowAsset;

    function __initialize(address _morphoBlueAddress, address _borrowAssetAddress, uint256 _chainId) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        morpho = IMorphoBlue(_morphoBlueAddress);
        borrowAsset = IERC20(_borrowAssetAddress);

        // Deploy a mock vault to use as (1) the borrowed assets recipient and (2) target of Call[] items
        vault = new MockVault();

        // Deploy the account
        morphoFlashLoanAssetManager = __deployAccount({_morphoBlueAddress: ETHEREUM_MORPHO_BLUE});

        // Initialize the account (as a proxy would)
        morphoFlashLoanAssetManager.init({_owner: accountOwner, _borrowedAssetsRecipient: address(vault)});
    }

    // DEPLOYMENT

    function __deployAccount(address _morphoBlueAddress) internal returns (IMorphoBlueFlashLoanAssetManager account_) {
        return IMorphoBlueFlashLoanAssetManager(
            deployCode("MorphoBlueFlashLoanAssetManagerLib.sol", abi.encode(_morphoBlueAddress))
        );
    }

    // HELPERS

    function __flashLoan(uint256 _amount) internal {
        IMorphoBlueFlashLoanAssetManager.Call[] memory calls = new IMorphoBlueFlashLoanAssetManager.Call[](1);
        calls[0] = IMorphoBlueFlashLoanAssetManager.Call({
            target: address(vault),
            data: abi.encodeWithSelector(vault.transferAsset.selector, borrowAsset, morphoFlashLoanAssetManager, _amount)
        });

        vm.prank(accountOwner);
        morphoFlashLoanAssetManager.flashLoan({_assetAddress: address(borrowAsset), _amount: _amount, _calls: calls});
    }

    // TESTS

    function test_init_failsWithAlreadyInitialized() public {
        address testInitOwner = makeAddr("TestInitOwner");
        address testInitBorrowedAssetsRecipient = makeAddr("TestInitBorrowedAssetsRecipient");

        // Already initialized during setup, so a 2nd call should fail
        vm.expectRevert(
            IMorphoBlueFlashLoanAssetManager.MorphoBlueFlashLoanAssetManager__Init__AlreadyInitialized.selector
        );
        morphoFlashLoanAssetManager.init({
            _owner: testInitOwner,
            _borrowedAssetsRecipient: testInitBorrowedAssetsRecipient
        });
    }

    function test_init_success() public {
        address testInitOwner = makeAddr("TestInitOwner");
        address testInitBorrowedAssetsRecipient = makeAddr("TestInitBorrowedAssetsRecipient");

        // Deploy a fresh account, without initializing
        IMorphoBlueFlashLoanAssetManager testInitAccount = __deployAccount({_morphoBlueAddress: address(morpho)});

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

    function test_flashLoan_failsWithUnauthorizedCaller() public {
        address randomCaller = makeAddr("RandomCaller");

        vm.expectRevert(
            IMorphoBlueFlashLoanAssetManager.MorphoBlueFlashLoanAssetManager__FlashLoan__Unauthorized.selector
        );
        vm.prank(randomCaller);
        morphoFlashLoanAssetManager.flashLoan({
            _assetAddress: address(0),
            _amount: 0,
            _calls: new IMorphoBlueFlashLoanAssetManager.Call[](0)
        });
    }

    function test_flashLoan_success() public {
        // Start the vault and the asset manager contract with a balance of the asset to borrow
        uint256 preVaultBalance = 123;
        uint256 preMorphoFlashLoanAssetManagerBalance = 456;
        uint256 borrowAmount = 789;
        increaseTokenBalance({_token: borrowAsset, _to: address(vault), _amount: preVaultBalance});
        increaseTokenBalance({
            _token: borrowAsset,
            _to: address(morphoFlashLoanAssetManager),
            _amount: preMorphoFlashLoanAssetManagerBalance
        });

        // Assert that the correct amount is borrowed based on Vault's repayment amount
        expectEmit(address(vault));
        emit MockVaultTransferAsset(address(borrowAsset), address(morphoFlashLoanAssetManager), borrowAmount);

        __flashLoan({_amount: borrowAmount});

        // Vault balance should now include the pre-tx asset manager contract surplus
        assertEq(
            borrowAsset.balanceOf(address(vault)),
            preVaultBalance + preMorphoFlashLoanAssetManagerBalance,
            "Incorrect remainder in vault"
        );
        // Nothing should remain in the asset manager contract
        assertEq(
            borrowAsset.balanceOf(address(morphoFlashLoanAssetManager)),
            0,
            "Non-zero remainder in asset manager contract"
        );
    }

    function test_onMorphoFlashLoan_failsWithUnauthorizedCaller() public {
        address randomCaller = makeAddr("RandomCaller");

        vm.expectRevert(
            IMorphoBlueFlashLoanAssetManager
                .MorphoBlueFlashLoanAssetManager__OnMorphoFlashLoan__UnauthorizedCaller
                .selector
        );
        vm.prank(randomCaller);
        morphoFlashLoanAssetManager.onMorphoFlashLoan({_amount: 0, _data: new bytes(0)});
    }
}

contract TestEthereum is TestBase {
    function setUp() public override {
        // Use USDT because it has annoying behavior
        __initialize({
            _morphoBlueAddress: ETHEREUM_MORPHO_BLUE,
            _borrowAssetAddress: ETHEREUM_USDT,
            _chainId: ETHEREUM_CHAIN_ID
        });
    }
}

contract MockVault {
    using SafeERC20Prod for IERC20Prod;

    event MockVaultTransferAsset(address assetAddress, address target, uint256 amount);

    function transferAsset(address _assetAddress, address _target, uint256 _amount) external {
        IERC20Prod(_assetAddress).safeTransfer(_target, _amount);

        emit MockVaultTransferAsset(_assetAddress, _target, _amount);
    }
}
