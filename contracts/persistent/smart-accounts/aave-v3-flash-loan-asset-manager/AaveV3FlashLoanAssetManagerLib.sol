// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IAaveV3FlashLoanReceiver} from "../../../external-interfaces/IAaveV3FlashLoanReceiver.sol";
import {IAaveV3Pool} from "../../../external-interfaces/IAaveV3Pool.sol";
import {IAaveV3PoolAddressProvider} from "../../../external-interfaces/IAaveV3PoolAddressProvider.sol";
import {IERC20} from "../../../external-interfaces/IERC20.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {IAaveV3FlashLoanAssetManager} from "./IAaveV3FlashLoanAssetManager.sol";

/// @title AaveV3FlashLoanAssetManagerLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An asset manager contract for executing flash loans on Aave V3
/// @dev Intended as implementation contract for a proxy.
/// Must add this contract instance as an asset manager on the intended Enzyme vault.
contract AaveV3FlashLoanAssetManagerLib is IAaveV3FlashLoanAssetManager, IAaveV3FlashLoanReceiver {
    using SafeERC20 for IERC20;

    // `REPAYMENT_BALANCE_BUFFER`: A small tolerance for repayment balance dust, e.g., in case of rebasing tokens
    uint256 internal constant REPAYMENT_BALANCE_BUFFER = 2;

    uint16 public immutable AAVE_REFERRAL_CODE;
    address public immutable override ADDRESSES_PROVIDER;

    // `owner`: The authorized caller of this contract instance
    address internal owner;
    // `borrowedAssetsRecipient`: The address where all borrowed assets are transferred. Generally the VaultProxy.
    address internal borrowedAssetsRecipient;

    error AaveV3FlashLoanAssetManager__ExecuteOperation__BalanceExceedsRepayment(uint256 balance);
    error AaveV3FlashLoanAssetManager__ExecuteOperation__UnauthorizedCaller();
    error AaveV3FlashLoanAssetManager__ExecuteOperation__UnauthorizedInitiator();
    error AaveV3FlashLoanAssetManager__FlashLoan__Unauthorized();
    error AaveV3FlashLoanAssetManager__Init__AlreadyInitialized();

    event BorrowedAssetsRecipientSet(address borrowedAssetsRecipient);
    event OwnerSet(address owner);

    constructor(address _aavePoolAddressProviderAddress, uint16 _aaveReferralCode) {
        AAVE_REFERRAL_CODE = _aaveReferralCode;
        ADDRESSES_PROVIDER = _aavePoolAddressProviderAddress;
    }

    /// @notice Initializes the contract
    /// @param _owner The owner (authorized caller) of the contract
    /// @param _borrowedAssetsRecipient The recipient of the flash loan borrowed assets
    function init(address _owner, address _borrowedAssetsRecipient) external {
        if (getOwner() != address(0)) revert AaveV3FlashLoanAssetManager__Init__AlreadyInitialized();

        __setOwner(_owner);
        __setBorrowedAssetsRecipient(_borrowedAssetsRecipient);
    }

    /// @notice Executes a flash loan on Aave V3
    /// @param _assets The assets to borrow
    /// @param _amounts The amounts to borrow
    /// @param _encodedCalls Encoded Call[] items to execute during the flash loan
    function flashLoan(address[] calldata _assets, uint256[] calldata _amounts, bytes calldata _encodedCalls)
        external
        override
    {
        if (msg.sender != getOwner()) revert AaveV3FlashLoanAssetManager__FlashLoan__Unauthorized();

        IAaveV3Pool(POOL())
            .flashLoan({
                _receiverAddress: address(this),
                _assets: _assets,
                _amounts: _amounts,
                _interestRateModes: new uint256[](_assets.length), // 0 is "no open debt"
                _onBehalfOf: address(0), // unused when interest mode = 0
                _params: _encodedCalls,
                _referralCode: AAVE_REFERRAL_CODE
            });
    }

    /// @dev Helper to set `borrowedAssetsRecipient`
    function __setBorrowedAssetsRecipient(address _borrowedAssetsRecipient) internal {
        borrowedAssetsRecipient = _borrowedAssetsRecipient;

        emit BorrowedAssetsRecipientSet(_borrowedAssetsRecipient);
    }

    /// @dev Helper to set `owner`
    function __setOwner(address _owner) internal {
        owner = _owner;

        emit OwnerSet(_owner);
    }

    //==================================================================================================================
    // IAaveV3FlashLoanReceiver
    //==================================================================================================================

    /// @notice Required callback function for Aave V3 flash loans
    function executeOperation(
        address[] calldata _assets,
        uint256[] calldata _amounts,
        uint256[] calldata _premiums,
        address _initiator,
        bytes calldata _params
    ) external override returns (bool success_) {
        if (_initiator != address(this)) {
            revert AaveV3FlashLoanAssetManager__ExecuteOperation__UnauthorizedInitiator();
        }
        address poolAddress = POOL();
        if (msg.sender != poolAddress) revert AaveV3FlashLoanAssetManager__ExecuteOperation__UnauthorizedCaller();

        // Send full balances of all borrowed assets to vault.
        // Leaving 0-balance for all assets makes calculating repayment amounts to transfer simpler,
        // and prevents griefing by sending surplus assets here.
        {
            address recipient = getBorrowedAssetsRecipient();
            for (uint256 i; i < _assets.length; i++) {
                IERC20 asset = IERC20(_assets[i]);
                asset.safeTransfer(recipient, asset.balanceOf(address(this)));
            }
        }

        // Execute calls.
        // The final `Call[]` items should transfer exact "asset + premium" amounts to this contract to repay the loan.
        {
            Call[] memory calls = abi.decode(_params, (Call[]));
            for (uint256 i; i < calls.length; i++) {
                Call memory call = calls[i];

                Address.functionCall({target: call.target, data: call.data});
            }
        }

        // Validate that this contract has no more than the exact expected amounts to repay loan + interest,
        // and grant allowances to Aave Pool to reclaim those amounts.
        // Protects against unexpected lowering of premiums.
        for (uint256 i; i < _assets.length; i++) {
            IERC20 asset = IERC20(_assets[i]);
            uint256 repaymentAmount = _amounts[i] + _premiums[i];

            uint256 balance = asset.balanceOf(address(this));
            if (balance > repaymentAmount + REPAYMENT_BALANCE_BUFFER) {
                revert AaveV3FlashLoanAssetManager__ExecuteOperation__BalanceExceedsRepayment(balance);
            }

            asset.safeApprove(poolAddress, repaymentAmount);
        }

        return true;
    }

    /// @notice Returns the Aave V3 pool
    function POOL() public view override returns (address poolAddress_) {
        return IAaveV3PoolAddressProvider(ADDRESSES_PROVIDER).getPool();
    }

    //==================================================================================================================
    // Storage getters
    //==================================================================================================================

    /// @notice Gets the recipient of the flash loan borrowed assets
    /// @return borrowedAssetsRecipient_ The recipient
    function getBorrowedAssetsRecipient() public view returns (address borrowedAssetsRecipient_) {
        return borrowedAssetsRecipient;
    }

    /// @notice Gets the owner (authorized caller) of the contract
    /// @return owner_ The owner
    function getOwner() public view returns (address owner_) {
        return owner;
    }
}
