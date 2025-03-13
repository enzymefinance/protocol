// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {IMysoV3DataTypes} from "../../../../../external-interfaces/IMysoV3DataTypes.sol";
import {IMysoV3Escrow} from "../../../../../external-interfaces/IMysoV3Escrow.sol";
import {IMysoV3Router} from "../../../../../external-interfaces/IMysoV3Router.sol";
import {MysoV3OptionWritingPositionLibBase1} from "./bases/MysoV3OptionWritingPositionLibBase1.sol";
import {IMysoV3OptionWritingPosition} from "./IMysoV3OptionWritingPosition.sol";

/**
 * @title MysoV3OptionWritingPositionLib
 * @dev This contract serves as an external position manager for MYSO V3, enabling the writing of covered calls
 * as an Enzyme vault manager and facilitating their creation and settlement on-chain via escrow contracts.
 * Options can be written by either taking a quote via RFQ or through Dutch auctions.
 *
 * ## Key Functionalities:
 *
 * 1. **Escrow Creation**:
 *    - `__createEscrowByTakingQuote`: Creates an escrow based on an RFQ quote, locking underlying tokens.
 *    - `__createEscrowByStartingAuction`: Initiates an auction-based escrow with defined parameters.
 *
 * 2. **Escrow Lifecycle Management**:
 *    - `__closeAndSweepEscrow`: Closes escrows and sweeps any token balances.
 *    - `__withdrawTokensFromEscrows`: Allows withdrawal of tokens from escrows.
 *    - `__sweep`: Allows withdrawal of tokens from this lib instance.
 *
 * 3. **State Getters**:
 *    - `getManagedAssets`: Retrieves all currently managed assets under the position.
 *    - `getDebtAssets`: Returns a list of debt-related assets (always empty in this implementation).
 *    - `getNumOpenEscrows`: Tracks the number of currently active (open) escrows.
 *    - `isEscrowClosed`: Checks if a specific escrow has been closed.
 *
 * @notice Whenever there are open escrows, the associated asset positions are considered
 * non-deterministic. Therefore, related NAV calculations are not supported in this version.
 * Vault managers must actively mark escrows as closed to prevent `getManagedAssets` from reverting.
 */
contract MysoV3OptionWritingPositionLib is
    IMysoV3OptionWritingPosition,
    MysoV3OptionWritingPositionLibBase1,
    AssetHelpers
{
    using SafeERC20 for IERC20;

    /// @dev The MYSO V3 Router contract
    IMysoV3Router public immutable MYSO_ROUTER;

    /// @dev Thrown if an empty array is incorrectly provided to close and sweep escrows
    error MysoV3OptionWritingPosition__CloseAndSweep__InvalidEmptyArray();
    /// @dev Thrown when a user attempts to close an escrow whose option has not expired yet
    error MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption();
    /// @dev Thrown when a user attempts to sweep an unassociated escrow as swept
    error MysoV3OptionWritingPosition__CloseAndSweep__UnassociatedEscrow();
    /// @dev Thrown when a user attempts to price the EP when an escrow is open
    error MysoV3OptionWritingPosition__GetManagedAssets__OpenEscrowsExist();
    /// @dev Thrown when a user attempts to retrieve escrow indices with an invalid range
    error MysoV3OptionWritingPosition__GetEscrowIndices__InvalidRange();
    /// @dev Thrown when arrays should be the same length but are not
    error MysoV3OptionWritingPosition__InputArraysLengthMismatch();
    /// @dev Thrown when a user attempts to close an escrow that is already closed
    error MysoV3OptionWritingPosition__Sweep__EscrowAlreadyClosed();
    /// @dev Thrown when an invalid action ID is provided to receiveCallFromVault
    error MysoV3OptionWritingPositionLib__ReceiveCallFromVault__InvalidActionId();

    constructor(address _mysoRouterAddress) {
        MYSO_ROUTER = IMysoV3Router(_mysoRouterAddress);
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this MYSO v3 external position type
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.CreateEscrowByTakingQuote)) {
            __createEscrowByTakingQuote({_actionArgs: abi.decode(actionArgs, (CreateEscrowByTakingQuoteActionArgs))});
        } else if (actionId == uint256(Actions.CreateEscrowByStartingAuction)) {
            __createEscrowByStartingAuction({
                _actionArgs: abi.decode(actionArgs, (CreateEscrowByStartingAuctionActionArgs))
            });
        } else if (actionId == uint256(Actions.CloseAndSweepEscrows)) {
            __closeAndSweepEscrow({_actionArgs: abi.decode(actionArgs, (CloseAndSweepEscrowActionArgs))});
        } else if (actionId == uint256(Actions.WithdrawTokensFromEscrows)) {
            __withdrawTokensFromEscrows({_actionArgs: abi.decode(actionArgs, (WithdrawTokensFromEscrowsActionArgs))});
        } else if (actionId == uint256(Actions.Sweep)) {
            __sweep({_actionArgs: abi.decode(actionArgs, (SweepActionArgs))});
        } else {
            revert MysoV3OptionWritingPositionLib__ReceiveCallFromVault__InvalidActionId();
        }
    }

    /// @notice Creates an escrow by taking a quote and writing an option
    /// @param _actionArgs Encoded arguments containing RFQ initialization data
    function __createEscrowByTakingQuote(CreateEscrowByTakingQuoteActionArgs memory _actionArgs) private {
        __approveAssetMaxAsNeeded({
            _asset: _actionArgs.rfqInitialization.optionInfo.underlyingToken,
            _target: address(MYSO_ROUTER),
            _neededAmount: _actionArgs.rfqInitialization.optionInfo.notional
        });

        // Take quote with EP as escrow owner
        MYSO_ROUTER.takeQuote({
            _escrowOwner: address(this),
            _rfqInitialization: _actionArgs.rfqInitialization,
            _distPartner: _actionArgs.distPartner
        });

        // Keep track of escrows and number of open/unsettled escrows
        __addLatestEscrow();

        // Send premium balance directly to vault
        address premiumToken = _actionArgs.rfqInitialization.optionInfo.advancedSettings.premiumTokenIsUnderlying
            ? _actionArgs.rfqInitialization.optionInfo.underlyingToken
            : _actionArgs.rfqInitialization.optionInfo.settlementToken;

        __pushFullAssetBalance({_target: msg.sender, _asset: premiumToken});
    }

    /// @notice Creates a escrow by starting new auction to write an option
    /// @param _actionArgs Encoded arguments containing auction initialization data
    /// @dev In contrast to RFQ match, option premium cannot be directly
    /// transferred to vault as match is triggered outside of this contract.
    /// In this case option premium needs to be retrieved via __withdrawTokens or __closeAndSweepEscrow
    function __createEscrowByStartingAuction(CreateEscrowByStartingAuctionActionArgs memory _actionArgs) private {
        __approveAssetMaxAsNeeded({
            _asset: _actionArgs.auctionInitialization.underlyingToken,
            _target: address(MYSO_ROUTER),
            _neededAmount: _actionArgs.auctionInitialization.notional
        });

        // Create auction with EP as escrow owner
        MYSO_ROUTER.createAuction({
            _escrowOwner: address(this),
            _auctionInitialization: _actionArgs.auctionInitialization,
            _distPartner: _actionArgs.distPartner
        });

        // Keep track of escrows and number of open/unsettled escrows
        __addLatestEscrow();
    }

    /// @notice Closes open escrows and sweeps any related balances
    /// @param _actionArgs Encoded arguments containing escrows to close and sweep
    function __closeAndSweepEscrow(CloseAndSweepEscrowActionArgs memory _actionArgs) private {
        // Vault manager needs to close escrows individually
        // Note: high level there are three cases to consider:
        // a) cancel auction: vault manager cancels auction before any match
        // -> vault manager needs to mark escrow as closed; can do that any time before match
        // -> in this case underlying tokens need to be swept
        // b) early "full" exercise: trading firm exercises all option tokens
        // -> vault manager needs to mark escrow as closed; can do that any time
        // -> in this case conversion amount needs to be sent from this contract
        // instance to vault
        // c) in all other cases: trading firm didn't (fully) exercise option
        // -> vault manager needs to mark escrow as closed after expiry
        // -> in this case underlying tokens and settlement tokens need to be swept;
        // underlying tokens may be related to left-overs from only partial exercise;
        // settlement tokens may be related to unclaimed collateral from borrows w/o repay;
        //  Note: case c) includes following sub-cases:
        //  c.i) option expired out-of-the-money: trading firm didn't exercise at all
        //  c.ii) partial exercise: trading firm partially exercised
        //  c.iii) borrow without repay: trading firm borrowed (part of) underlying but
        // didn't repay before expiry

        if (_actionArgs.escrowIdxs.length == 0) {
            revert MysoV3OptionWritingPosition__CloseAndSweep__InvalidEmptyArray();
        }

        for (uint256 i = 0; i < _actionArgs.escrowIdxs.length; i++) {
            address escrow = MYSO_ROUTER.getEscrows(_actionArgs.escrowIdxs[i], 1)[0];

            // Retrieve relevant escrow token balances for sweeping
            IMysoV3DataTypes.OptionInfo memory optionInfo = IMysoV3Escrow(escrow).optionInfo();

            // _actionArgs._skipWithdrawFromEscrow flag is used to skip calling withdraw
            // in case there was a full exercise and fund owner wants to close escrow
            // early before expiry and to prevent a griefer being able to donate
            // small token balances to escrow which prior to expiry would cause
            // withdraw call on router/escrow to fail; in default case this can be set to false

            // check case a) - unmatched auction (option not minted yet)
            // check case b) - full exercise iff option token supply == 0 and total borrows == 0)
            if (
                !IMysoV3Escrow(escrow).optionMinted()
                    || (IERC20(escrow).totalSupply() == 0 && IMysoV3Escrow(escrow).totalBorrowed() == 0)
            ) {
                __closeAndSweep({
                    _escrowIdx: _actionArgs.escrowIdxs[i],
                    _escrow: escrow,
                    _underlyingToken: optionInfo.underlyingToken,
                    _settlementToken: optionInfo.settlementToken,
                    _skipWithdrawFromEscrow: _actionArgs.skipWithdrawFromEscrow
                });
                continue;
            }

            // check case c) - all other cases:
            // need to check if option already expired; otherwise revert as
            // we cannot withdraw yet
            if (block.timestamp <= optionInfo.expiry) {
                revert MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption();
            }
            __closeAndSweep({
                _escrowIdx: _actionArgs.escrowIdxs[i],
                _escrow: escrow,
                _underlyingToken: optionInfo.underlyingToken,
                _settlementToken: optionInfo.settlementToken,
                _skipWithdrawFromEscrow: _actionArgs.skipWithdrawFromEscrow
            });
        }
    }

    /// @notice Withdraws tokens from escrows
    /// @param _actionArgs Encoded arguments containing escrow addresses, token addresses, and amounts
    function __withdrawTokensFromEscrows(WithdrawTokensFromEscrowsActionArgs memory _actionArgs) private {
        // Allow vault manager to withdraw tokens; this way vault
        // managers can withdraw collateral amounts or underlying amounts
        // from unexercised options as well as accidentally sent tokens
        // or airdrops/rewards from escrows;
        // Note: generic withdrawing will NOT mark given escrows as closed,
        // in which case getManagedAssets() will continue to fail if given
        // escrows are not explicitly closed via __closeAndSweepEscrow()
        if (_actionArgs.escrows.length != _actionArgs.tokens.length) {
            revert MysoV3OptionWritingPosition__InputArraysLengthMismatch();
        }
        __withdraw(_actionArgs.escrows, _actionArgs.tokens);
    }

    /// @notice Withdraws tokens from position lib instance
    /// @param _actionArgs Encoded arguments containing token addresses, and amounts
    function __sweep(SweepActionArgs memory _actionArgs) private {
        // Allow vault manager to withdraw tokens from position lib; this way vault
        // managers can withdraw option premium proceeds or conversion
        // proceeds or accidentally sent tokens as well as airdrops/rewards;
        // Note: generic withdrawing will NOT mark given escrows as closed,
        // in which case getManagedAssets() will continue to fail if given
        // escrows are not explicitly closed via __closeAndSweepEscrow()
        __pushFullAssetBalances(msg.sender, _actionArgs.tokens);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        // Check if vault manager has open escrows, in which case fair value
        // calculation is non-deterministic and not supported;
        if (openEscrowsIdxs.length > 0) {
            revert MysoV3OptionWritingPosition__GetManagedAssets__OpenEscrowsExist();
        }
        // else return empty list as all assets are with vault manager already;
        return (new address[](0), new uint256[](0));
    }

    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        // No debt assets to track
        return (new address[](0), new uint256[](0));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Retrieves the number of open escrows
    /// @return numOpenEscrows_ The total number of open escrows managed by this contract
    function getNumOpenEscrows() external view returns (uint256 numOpenEscrows_) {
        return openEscrowsIdxs.length;
    }

    /// @notice Retrieves the open escrow indices within the specified range
    /// @param _from Starting index
    /// @param _numElements Number of escrow indices to retrieve
    /// @return openEscrowsIdxs_ List of open escrow indices
    function getEscrowIdxs(uint256 _from, uint256 _numElements)
        external
        view
        returns (uint32[] memory openEscrowsIdxs_)
    {
        if (_numElements == 0 || _from + _numElements > openEscrowsIdxs.length) {
            revert MysoV3OptionWritingPosition__GetEscrowIndices__InvalidRange();
        }

        openEscrowsIdxs_ = new uint32[](_numElements);
        for (uint256 i = 0; i < _numElements; ++i) {
            openEscrowsIdxs_[i] = openEscrowsIdxs[_from + i];
        }
    }

    //////////////////////
    // INTERNAL HELPERS //
    //////////////////////

    function __addLatestEscrow() private {
        // casting to uint32 ok for practical scenarios
        uint32 numEscrows = uint32(MYSO_ROUTER.numEscrows());

        // Push latest escrow index to internal list
        // numEscrows is always > 0 since _addLatestEscrow is only called after creating escrow via MYSO v3 router
        uint32 idx = numEscrows - 1;
        openEscrowsIdxs.push(idx);

        emit EscrowCreated(idx);
    }

    function __closeAndSweep(
        uint32 _escrowIdx,
        address _escrow,
        address _underlyingToken,
        address _settlementToken,
        bool _skipWithdrawFromEscrow
    ) private {
        if (IMysoV3Escrow(_escrow).owner() != address(this)) {
            revert MysoV3OptionWritingPosition__CloseAndSweep__UnassociatedEscrow();
        }

        // Remove index from openEscrowsIdxs
        bool escrowIdxFound;
        for (uint256 i = 0; i < openEscrowsIdxs.length; i++) {
            if (_escrowIdx == openEscrowsIdxs[i]) {
                escrowIdxFound = true;
                openEscrowsIdxs[i] = openEscrowsIdxs[openEscrowsIdxs.length - 1];
                openEscrowsIdxs.pop();
                break;
            }
        }

        // in case escrow is owned by this EP but escrow index
        // doesn't exist in openEscrowsIdxs anymore means
        // the escrow must've been closed and swept already
        if (!escrowIdxFound) {
            revert MysoV3OptionWritingPosition__Sweep__EscrowAlreadyClosed();
        }

        // Three non mutually exclusive cases to consider:

        // Case 1: sweep any underlying token balances from escrow;
        // this is the case if option was (partially) exercised.
        // Case 2: sweep any settlement token balances from escrow;
        // this is the case when trading firm borrowed underlying
        // and posted settlement token as collateral but didn't
        // repay and collateral is now claimable for option writer.
        if (!_skipWithdrawFromEscrow) {
            address[] memory escrows_ = new address[](2);
            escrows_[0] = _escrow;
            escrows_[1] = _escrow;
            address[] memory tokens_ = new address[](2);
            tokens_[0] = _underlyingToken;
            tokens_[1] = _settlementToken;
            __withdraw(escrows_, tokens_);
        }

        // Case 3: sweep any underlying/settlement token balances from
        // this lib instance; this is the case when:
        // (a) an auction was matched, in which case option premium is paid to
        // this contract without being forwarded to vault (in contrast to
        // writing options via RFQ, see __createEscrowByTakingQuote) and
        // (b) option was (partially) converted and conversion amount
        // is held in this contract instance.
        // Note: balances being held by this contract instance stem from
        // the fact that premium token proceeds are always sent to the
        // escrow owner and escrows are initialized with this contract
        // as their owner;
        // Note: also note that option premiums can be paid both in
        // underlying token and settlement token (see
        // optionInfo.advancedSettings.premiumTokenIsUnderlying) hence
        // we need to check both balances
        __pushFullAssetBalance({_target: msg.sender, _asset: _underlyingToken});
        __pushFullAssetBalance({_target: msg.sender, _asset: _settlementToken});

        emit EscrowClosedAndSwept(_escrowIdx);
    }

    function __withdraw(address[] memory _escrows, address[] memory _tokens) private {
        for (uint256 i = 0; i < _escrows.length; i++) {
            uint256 bal = IERC20(_tokens[i]).balanceOf(_escrows[i]);
            if (bal > 0) {
                MYSO_ROUTER.withdraw({_escrow: _escrows[i], _to: msg.sender, _token: _tokens[i], _amount: bal});
            }
        }
    }
}
