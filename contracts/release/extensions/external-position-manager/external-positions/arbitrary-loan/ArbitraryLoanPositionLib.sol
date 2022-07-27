// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "../../../../../persistent/external-positions/arbitrary-loan/ArbitraryLoanPositionLibBase1.sol";
import "../../../../../persistent/external-positions/IExternalPositionProxy.sol";
import "../../../../interfaces/IWETH.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/AssetHelpers.sol";
import "../../../../utils/MathHelpers.sol";
import "./modules/IArbitraryLoanAccountingModule.sol";
import "./IArbitraryLoanPosition.sol";
import "./ArbitraryLoanPositionDataDecoder.sol";

/// @title ArbitraryLoanPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for ArbitraryLoanPosition
/// @dev This contract is intended for loan assets with standard behaviors.
/// Tokens with non-standard behaviors (e.g., rebasing or fee-on-transfer)
/// can still work, but may lead to unexpected results (e.g., borrowable amount).
contract ArbitraryLoanPositionLib is
    IArbitraryLoanPosition,
    ArbitraryLoanPositionDataDecoder,
    ArbitraryLoanPositionLibBase1,
    AssetHelpers,
    MathHelpers
{
    using AddressArrayLib for address[];
    using SafeCast for uint256;
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    address private immutable WRAPPED_NATIVE_ASSET;

    /// @dev Only set _wrappedNativeAsset if the asset adheres to IWETH.deposit()
    constructor(address _wrappedNativeAsset) public {
        WRAPPED_NATIVE_ASSET = _wrappedNativeAsset;
    }

    modifier onlyNotClosed {
        require(!loanIsClosed(), "onlyNotClosed: Loan closed");
        _;
    }

    /// @notice Initializes the external position
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.ConfigureLoan)) {
            __actionConfigureLoan(actionArgs);
        } else if (actionId == uint256(Actions.UpdateBorrowableAmount)) {
            __actionUpdateBorrowableAmount(actionArgs);
        } else if (actionId == uint256(Actions.CallOnAccountingModule)) {
            __actionCallOnAccountingModule(actionArgs);
        } else if (actionId == uint256(Actions.Reconcile)) {
            __actionReconcile(actionArgs);
        } else if (actionId == uint256(Actions.CloseLoan)) {
            __actionCloseLoan(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Helper to execute Action.CallOnAccountingModule.
    /// Allows for arbitrary actions within the accounting module.
    function __actionCallOnAccountingModule(bytes memory _actionArgs) private {
        IArbitraryLoanAccountingModule(getAccountingModule()).receiveCallFromLoan(_actionArgs);
    }

    /// @dev Helper to execute Action.CloseLoan.
    /// Accounting module can set the rules for when the loan can be considered closed.
    /// After closing a loan, its face value becomes 0 and no more borrowing is allowed.
    function __actionCloseLoan(bytes memory _actionArgs) private onlyNotClosed {
        __reconcile(__decodeCloseLoanActionArgs(_actionArgs), true);

        address accountingModuleMem = getAccountingModule();
        if (accountingModuleMem != address(0)) {
            IArbitraryLoanAccountingModule(accountingModuleMem).preClose(
                getTotalBorrowed(),
                getTotalRepaid()
            );
        }

        __updateBorrowableAmount(0);
        isClosed = true;

        emit LoanClosed();
    }

    /// @dev Helper to execute Action.ConfigureLoan
    function __actionConfigureLoan(bytes memory _actionArgs) private {
        require(getLoanAsset() == address(0), "__actionConfigureLoan: Already configured");

        (
            address borrowerMem,
            address loanAssetMem,
            uint256 amount,
            address accountingModuleMem,
            bytes memory accountingModuleConfigData,
            bytes32 description
        ) = __decodeConfigureLoanActionArgs(_actionArgs);

        require(borrowerMem != address(0), "__actionConfigureLoan: Empty borrower");
        require(loanAssetMem != address(0), "__actionConfigureLoan: Empty loan asset");

        borrower = borrowerMem;
        loanAsset = loanAssetMem;

        if (accountingModuleMem != address(0)) {
            accountingModule = accountingModuleMem;

            IArbitraryLoanAccountingModule(accountingModuleMem).configure(
                accountingModuleConfigData
            );
        }

        emit LoanConfigured(borrowerMem, loanAssetMem, accountingModuleMem, description);

        // Optionally set a first borrowable amount
        if (amount > 0) {
            __updateBorrowableAmount(amount);
        }
    }

    /// @dev Helper to execute Action.Reconcile.
    /// See notes for __reconcile().
    function __actionReconcile(bytes memory _actionArgs) private {
        __reconcile(__decodeReconcileActionArgs(_actionArgs), false);
    }

    /// @dev Helper to execute Action.UpdateBorrowableAmount
    function __actionUpdateBorrowableAmount(bytes memory _actionArgs) private onlyNotClosed {
        int256 amountDelta = __decodeUpdateBorrowableAmountActionArgs(_actionArgs);

        if (amountDelta < 0) {
            uint256 decreaseAmount = uint256(-amountDelta);

            __updateBorrowableAmount(getBorrowableAmount().sub(decreaseAmount));

            // If decreasing borrowable amount, send unborrowable capital to the VaultProxy
            ERC20(loanAsset).safeTransfer(msg.sender, decreaseAmount);
        } else {
            __updateBorrowableAmount(getBorrowableAmount().add(uint256(amountDelta)));
        }
    }

    /// @dev Helper to reconcile tokens sent directly to the position.
    /// _extraAssetsToSweep could be - for example - a repayment or insurance payout
    /// that is transferred directly to this contract as a non-loan asset.
    function __reconcile(address[] memory _extraAssetsToSweep, bool _close) private {
        // Wrap the native asset (e.g., WETH) if there is any balance
        if (WRAPPED_NATIVE_ASSET != address(0)) {
            uint256 nativeAssetBalance = address(this).balance;

            if (nativeAssetBalance > 0) {
                IWETH(WRAPPED_NATIVE_ASSET).deposit{value: nativeAssetBalance}();
            }
        }

        ERC20 loanAssetContract = ERC20(getLoanAsset());

        require(
            !_extraAssetsToSweep.contains(address(loanAssetContract)),
            "__reconcile: Extra assets contains loan asset"
        );

        uint256 loanAssetBalance = loanAssetContract.balanceOf(address(this));

        uint256 nonBorrowableLoanAssetBal = __subOrZero(loanAssetBalance, getBorrowableAmount());

        // Calculate any repayment using the available balances of all assets.
        // Considers any surplus loan asset balance as a potential repayment.
        if (nonBorrowableLoanAssetBal > 0) {
            uint256 repayAmount;
            uint256 totalRepaidMem = getTotalRepaid();
            address accountingModuleMem = getAccountingModule();

            if (accountingModuleMem != address(0)) {
                // Some modules might not allow over-repayment,
                // in which case any excess loanAsset amount would be sent to the vault
                // without recording it as a repayment.
                repayAmount = IArbitraryLoanAccountingModule(accountingModuleMem).preReconcile(
                    getTotalBorrowed(),
                    totalRepaidMem,
                    nonBorrowableLoanAssetBal,
                    _extraAssetsToSweep
                );
            } else {
                repayAmount = nonBorrowableLoanAssetBal;
            }

            __updateTotalRepaid(totalRepaidMem.add(repayAmount));
        }

        // Transfer excess loan asset to the VaultProxy
        uint256 loanAssetAmountToTransfer;
        if (_close) {
            // If closing the loan, transfer the full amount
            loanAssetAmountToTransfer = loanAssetBalance;
        } else {
            // If not closing the loan, only transfer the amount exceeding the borrowable amount
            loanAssetAmountToTransfer = nonBorrowableLoanAssetBal;
        }
        if (loanAssetAmountToTransfer > 0) {
            loanAssetContract.safeTransfer(msg.sender, loanAssetAmountToTransfer);
        }

        // Sweep any extra specified assets into the VaultProxy
        __pushFullAssetBalances(msg.sender, _extraAssetsToSweep);
    }

    /// @dev Helper to update the borrowable amount
    function __updateBorrowableAmount(uint256 _nextBorrowableAmount) private {
        borrowableAmount = _nextBorrowableAmount;

        emit BorrowableAmountUpdated(_nextBorrowableAmount);
    }

    /// @dev Helper to update the total repaid amount
    function __updateTotalRepaid(uint256 _nextTotalRepaid) private {
        totalRepaid = _nextTotalRepaid.toUint128();

        emit TotalRepaidUpdated(_nextTotalRepaid);
    }

    //////////////////////
    // BORROWER ACTIONS //
    //////////////////////

    /// @notice Borrows a specified amount
    /// @param _amount The amount to borrow
    function borrow(uint256 _amount) external {
        require(msg.sender == getBorrower(), "borrow: Unauthorized");
        require(_amount > 0, "borrow: Empty _amount");

        uint256 totalBorrowedMem = getTotalBorrowed();

        address accountingModuleMem = getAccountingModule();
        if (accountingModuleMem != address(0)) {
            IArbitraryLoanAccountingModule(accountingModuleMem).preBorrow(
                totalBorrowedMem,
                getTotalRepaid(),
                _amount
            );
        }

        // _amount <= borrowableAmount is enforced here
        __updateBorrowableAmount(getBorrowableAmount().sub(_amount));

        totalBorrowedMem = totalBorrowedMem.add(_amount);
        totalBorrowed = totalBorrowedMem.toUint128();

        ERC20(loanAsset).safeTransfer(msg.sender, _amount);

        emit TotalBorrowedUpdated(totalBorrowedMem);
    }

    /// @notice Repays a specified amount
    /// @param _amount The amount to repay
    /// @dev Anybody can repay.
    /// It is possible to pay more than the max loan balance.
    /// Users wanting to pay the exact loan balance should use `_amount = type(uint256).max`.
    /// As this function call comes directly from an end user, it does not pass through
    /// architecture to add the loan asset as a trackedAsset of the VaultProxy.
    /// Asset managers should make sure to always track the loan asset.
    function repay(uint256 _amount) external {
        uint256 totalRepaidMem = getTotalRepaid();
        address accountingModuleMem = getAccountingModule();

        uint256 repayAmount;
        if (accountingModuleMem != address(0)) {
            // preRepay() logic should also handle calculating max repayAmount
            repayAmount = IArbitraryLoanAccountingModule(accountingModuleMem).preRepay(
                getTotalBorrowed(),
                totalRepaidMem,
                _amount
            );
        } else if (_amount == type(uint256).max) {
            repayAmount = __subOrZero(getTotalBorrowed(), totalRepaidMem);
        } else {
            repayAmount = _amount;
        }
        require(repayAmount > 0, "repay: Nothing to repay");

        __updateTotalRepaid(totalRepaidMem.add(repayAmount));

        ERC20(getLoanAsset()).safeTransferFrom(
            msg.sender,
            IExternalPositionProxy(address(this)).getVaultProxy(),
            repayAmount
        );
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        if (loanIsClosed()) {
            return (assets_, amounts_);
        }

        address accountingModuleMem = getAccountingModule();
        uint256 totalBalance;

        if (accountingModuleMem != address(0)) {
            totalBalance = IArbitraryLoanAccountingModule(accountingModuleMem).calcFaceValue(
                getTotalBorrowed(),
                getTotalRepaid()
            );
        } else {
            totalBalance = __subOrZero(getTotalBorrowed(), getTotalRepaid());
        }

        // Total balance is the face value + the borrowable amount in the current contract.
        // Ignores any excess loan asset balance, which might represent a repayment.
        totalBalance = totalBalance.add(getBorrowableAmount());
        if (totalBalance == 0) {
            return (assets_, amounts_);
        }

        assets_ = new address[](1);
        assets_[0] = getLoanAsset();

        amounts_ = new uint256[](1);
        amounts_[0] = totalBalance;

        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the accounting module used
    /// @return accountingModule_ The accounting module address
    function getAccountingModule() public view returns (address accountingModule_) {
        return accountingModule;
    }

    /// @notice Gets the borrowable amount
    /// @return borrowableAmount_ The borrowable amount
    function getBorrowableAmount() public view returns (uint256 borrowableAmount_) {
        return borrowableAmount;
    }

    /// @notice Gets the loan borrower
    /// @return borrower_ The borrower
    function getBorrower() public view returns (address borrower_) {
        return borrower;
    }

    /// @notice Gets the loaned asset
    /// @return asset_ The asset
    function getLoanAsset() public view override returns (address asset_) {
        return loanAsset;
    }

    /// @notice Gets the total amount borrowed
    /// @return totalBorrowed_ The total amount borrowed
    function getTotalBorrowed() public view returns (uint256 totalBorrowed_) {
        return totalBorrowed;
    }

    /// @notice Gets the total amount repaid
    /// @return totalRepaid_ The total amount repaid
    function getTotalRepaid() public view returns (uint256 totalRepaid_) {
        return totalRepaid;
    }

    /// @notice Checks whether the loan is closed
    /// @return isClosed_ True if the loan is closed
    function loanIsClosed() public view returns (bool isClosed_) {
        return isClosed;
    }
}
