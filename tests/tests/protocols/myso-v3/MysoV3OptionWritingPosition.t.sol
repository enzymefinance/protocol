// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";
import {ECDSA} from "lib/openzeppelin-solc-0.8/contracts/utils/cryptography/ECDSA.sol";

import {IMysoV3DataTypes as IMysoV3DataTypesProd} from "contracts/external-interfaces/IMysoV3DataTypes.sol";
import {IMysoV3OptionWritingPosition as IMysoV3OptionWritingPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/myso-v3/IMysoV3OptionWritingPosition.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IMysoV3DataTypes} from "tests/interfaces/external/IMysoV3DataTypes.sol";
import {IMysoV3Router} from "tests/interfaces/external/IMysoV3Router.sol";
import {IMysoV3Escrow} from "tests/interfaces/external/IMysoV3Escrow.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IMysoV3OptionWritingPositionLib} from "tests/interfaces/internal/IMysoV3OptionWritingPositionLib.sol";

import {MockOracle} from "./MockOracle.sol";

address constant ETHEREUM_MYSO_ROUTER_V3 = 0x70B4B4991B21AC596CB9bC416B21f4B848E24ac5;

////////////////
// TEST BASES //
////////////////

abstract contract MysoV3OptionWritingPositionTestBase is IntegrationTest {
    IMysoV3OptionWritingPositionLib mysoV3OptionWritingPosition;

    event EscrowClosedAndSwept(uint256 escrowIdx);
    event EscrowCreated(uint256 escrowIdx);

    address fundOwner;
    address comptrollerProxyAddress;
    address vaultProxyAddress;

    address tradingFirm;
    uint256 tradingFirmKey;

    address mockOracle;
    IMysoV3Router mysoRouter;

    IERC20 underlyingToken;
    IERC20 settlementToken;
    uint256 underlyingTokenPrice;

    // Set by child contract
    EnzymeVersion version;

    function __initialize(
        uint256 _chainId,
        EnzymeVersion _version,
        uint256 _forkBlock,
        address _underlyingTokenAddress,
        address _settlementTokenAddress,
        address _mysoRouterAddress
    ) internal {
        (tradingFirm, tradingFirmKey) = makeAddrAndKey("Trading Firm");

        setUpNetworkEnvironment({_chainId: _chainId, _forkBlock: _forkBlock});

        version = _version;
        mysoRouter = IMysoV3Router(_mysoRouterAddress);

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Deploy all position dependencies
        uint256 typeId = __deployPositionType();

        underlyingToken = IERC20(_underlyingTokenAddress);
        settlementToken = IERC20(_settlementTokenAddress);

        // Deploy mock oracle for auction testing and set dummy price
        mockOracle = __deployMockOracle();
        underlyingTokenPrice = 3_000 * assetUnit(settlementToken);
        MockOracle(mockOracle).setPrice(address(underlyingToken), address(settlementToken), underlyingTokenPrice);

        // Create an empty MysoV3OptionWritingPosition for the fund
        vm.prank(fundOwner);
        mysoV3OptionWritingPosition = IMysoV3OptionWritingPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );

        // Fund trading firm with sufficient settlement token to pay option premium
        increaseTokenBalance({
            _token: IERC20(settlementToken),
            _to: tradingFirm,
            _amount: 1_000_000 * assetUnit(IERC20(settlementToken))
        });

        // Trading firm approves MYSO router
        vm.prank(tradingFirm);
        IERC20(settlementToken).approve(address(mysoRouter), type(uint256).max);

        // Fund vault with underlyingToken such that it has sufficient balance to write call
        increaseTokenBalance({_token: underlyingToken, _to: vaultProxyAddress, _amount: 10 * assetUnit(underlyingToken)});
    }

    // DEPLOYMENT HELPERS

    function __deployLib() internal returns (address libAddress_) {
        bytes memory args = abi.encode(address(mysoRouter));

        return deployCode("MysoV3OptionWritingPositionLib.sol", args);
    }

    function __deployParser() internal returns (address parserAddress_) {
        bytes memory args = abi.encode(address(mysoRouter));

        return deployCode("MysoV3OptionWritingPositionParser.sol", args);
    }

    function __deployPositionType() internal returns (uint256 typeId_) {
        // Deploy position contracts
        address libAddress = __deployLib();
        address parserAddress = __deployParser();

        // Register position type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "MYSO_V3",
            _lib: libAddress,
            _parser: parserAddress
        });

        return typeId_;
    }

    function __deployMockOracle() internal returns (address parserAddress_) {
        return deployCode("MockOracle.sol");
    }

    // ACTION HELPERS

    function __createEscrowByTakingQuote(
        IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs memory _actionArgs
    ) internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(mysoV3OptionWritingPosition),
            _actionId: uint256(IMysoV3OptionWritingPositionProd.Actions.CreateEscrowByTakingQuote),
            _actionArgs: abi.encode(_actionArgs)
        });
    }

    function __createEscrowByStartingAuction(
        IMysoV3OptionWritingPositionProd.CreateEscrowByStartingAuctionActionArgs memory _actionArgs
    ) internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(mysoV3OptionWritingPosition),
            _actionId: uint256(IMysoV3OptionWritingPositionProd.Actions.CreateEscrowByStartingAuction),
            _actionArgs: abi.encode(_actionArgs)
        });
    }

    function __closeAndSweepEscrows(IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs memory _actionArgs)
        internal
    {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(mysoV3OptionWritingPosition),
            _actionId: uint256(IMysoV3OptionWritingPositionProd.Actions.CloseAndSweepEscrows),
            _actionArgs: abi.encode(_actionArgs)
        });
    }

    function __closeAndSweepEscrowsUnauthorized(
        IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs memory _actionArgs
    ) internal {
        vm.prank(tradingFirm);
        vm.expectRevert("receiveCallFromComptroller: Unauthorized");
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(mysoV3OptionWritingPosition),
            _actionId: uint256(IMysoV3OptionWritingPositionProd.Actions.CloseAndSweepEscrows),
            _actionArgs: abi.encode(_actionArgs)
        });
    }

    function __withdrawFromEscrows(
        IMysoV3OptionWritingPositionProd.WithdrawTokensFromEscrowsActionArgs memory _actionArgs
    ) internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(mysoV3OptionWritingPosition),
            _actionId: uint256(IMysoV3OptionWritingPositionProd.Actions.WithdrawTokensFromEscrows),
            _actionArgs: abi.encode(_actionArgs)
        });
    }

    function __sweep(IMysoV3OptionWritingPositionProd.SweepActionArgs memory _actionArgs) internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(mysoV3OptionWritingPosition),
            _actionId: uint256(IMysoV3OptionWritingPositionProd.Actions.Sweep),
            _actionArgs: abi.encode(_actionArgs)
        });
    }

    // MISC HELPERS
    function __getDefaultOptionInfo() internal view returns (IMysoV3DataTypesProd.OptionInfo memory optionInfo) {
        return IMysoV3DataTypesProd.OptionInfo({
            underlyingToken: address(underlyingToken),
            expiry: uint48(block.timestamp + 30 days), // default expiry 30 days
            settlementToken: address(settlementToken),
            earliestExercise: uint48(block.timestamp),
            notional: uint128(10 * assetUnit(underlyingToken)),
            strike: uint128(underlyingTokenPrice),
            advancedSettings: IMysoV3DataTypesProd.AdvancedSettings({
                borrowCap: 1e18, // 100% borrowing allowed
                oracle: address(0),
                premiumTokenIsUnderlying: false,
                votingDelegationAllowed: false,
                allowedDelegateRegistry: address(0)
            })
        });
    }

    function __getDefaultOptionInfo(address _underlyingToken, address _settlementToken, bool premiumTokenIsUnderlying)
        internal
        view
        returns (IMysoV3DataTypesProd.OptionInfo memory optionInfo)
    {
        return IMysoV3DataTypesProd.OptionInfo({
            underlyingToken: _underlyingToken,
            expiry: uint48(block.timestamp + 30 days), // default expiry 30 days
            settlementToken: _settlementToken,
            earliestExercise: uint48(block.timestamp),
            notional: uint128(10 * assetUnit(underlyingToken)),
            strike: uint128(underlyingTokenPrice),
            advancedSettings: IMysoV3DataTypesProd.AdvancedSettings({
                borrowCap: 1e18, // 100% borrowing allowed
                oracle: address(0),
                premiumTokenIsUnderlying: premiumTokenIsUnderlying,
                votingDelegationAllowed: false,
                allowedDelegateRegistry: address(0)
            })
        });
    }

    function __getRfqPayloadHash(
        IMysoV3DataTypesProd.OptionInfo memory optionInfo,
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, optionInfo, rfqQuote.premium, rfqQuote.validUntil));
    }

    function __getDefaultSignedQuote(IMysoV3DataTypesProd.OptionInfo memory optionInfo)
        internal
        returns (IMysoV3DataTypesProd.RFQQuote memory rfqQuote)
    {
        // Define trading firm's offer
        rfqQuote = IMysoV3DataTypesProd.RFQQuote({
            premium: uint128(1_000 * assetUnit(settlementToken)),
            validUntil: uint48(block.timestamp + 10 hours),
            signature: "", // Placeholder (to be set below)
            eip1271Maker: address(0)
        });
        bytes32 rfqPayloadHash = __getRfqPayloadHash(optionInfo, rfqQuote);

        // Trading firm signs offer and adds signature to RFQ struct
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(tradingFirmKey, ECDSA.toEthSignedMessageHash(rfqPayloadHash));
        rfqQuote.signature = abi.encodePacked(r, s, v);

        // Check signature is correct
        address signer = ecrecover(ECDSA.toEthSignedMessageHash(rfqPayloadHash), v, r, s);
        assertEq(signer, tradingFirm, "Recovered signer doesn't match expected signer");
    }

    function __getDefaultAuctionInitialization(IMysoV3DataTypesProd.OptionInfo memory optionInfo)
        internal
        view
        returns (IMysoV3DataTypesProd.AuctionInitialization memory auctionInitialization)
    {
        auctionInitialization = IMysoV3DataTypesProd.AuctionInitialization({
            underlyingToken: optionInfo.underlyingToken,
            settlementToken: optionInfo.settlementToken,
            notional: optionInfo.notional,
            auctionParams: IMysoV3DataTypesProd.AuctionParams({
                relStrike: uint128(1 ether),
                tenor: uint48(30 days),
                earliestExerciseTenor: uint48(0),
                decayStartTime: uint32(block.timestamp),
                decayDuration: uint32(1 hours),
                relPremiumStart: uint64(1 ether / 10),
                relPremiumFloor: uint64(1 ether / 10),
                minSpot: 1,
                maxSpot: type(uint128).max
            }),
            advancedSettings: IMysoV3DataTypesProd.AdvancedSettings({
                borrowCap: 0,
                oracle: mockOracle,
                premiumTokenIsUnderlying: false,
                votingDelegationAllowed: false,
                allowedDelegateRegistry: address(0)
            })
        });
    }

    // TESTS - ACTIONS

    function test_createEscrowByTakingQuote_noExercise_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        uint256 preVaultBal = underlyingToken.balanceOf(vaultProxyAddress);

        // Check initially no open escrows
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 0, "EP has open escrows");

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault has non-zero settlement token balance"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match option premium"
        ); // check premium has been received in vault

        // Check myso v3 position lib contract should be set as escrow owner
        uint256 numEscrows = mysoRouter.numEscrows();
        address[] memory escrows = mysoRouter.getEscrows({_from: numEscrows - 1, _numElements: 1});
        address vaultOwner = IMysoV3Escrow(escrows[0]).owner();
        assertEq(vaultOwner, address(mysoV3OptionWritingPosition), "Escrow owner doesn't match EP");

        // Check underlying moved from vault to escrow
        assertEq(
            underlyingToken.balanceOf(escrows[0]),
            preVaultBal - underlyingToken.balanceOf(vaultProxyAddress),
            "Escrow underlying token balance doesn't match"
        );

        // Check number of (open) escrows correctly tracked
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 1, "EP has unexpected number of open escrows");

        // Check revert when getEscrowIdxs is called with invalid from and numElements
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__GetEscrowIndices__InvalidRange.selector
        );
        mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 0});
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__GetEscrowIndices__InvalidRange.selector
        );
        mysoV3OptionWritingPosition.getEscrowIdxs({_from: 1, _numElements: 1});

        // Check escrows tracked on position lib match those recorded on myso router
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        assertEq(escrows[0], linkedEscrowAddrs[0], "Escrow indices don't match");

        // Check getManagedAssets should revert as long as there's an open escrow
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__GetManagedAssets__OpenEscrowsExist.selector
        );
        mysoV3OptionWritingPosition.getManagedAssets();

        // Close and sweep should revert with empty array
        uint32[] memory emptyArray = new uint32[](0);
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__CloseAndSweep__InvalidEmptyArray.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: emptyArray,
                skipWithdrawFromEscrow: false
            })
        );

        // Close and sweep should revert prior to expiry
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Move forward past expiry to close and sweep
        vm.warp(optionInfo.expiry + 1);

        // Check revert on unauthorized sweep
        __closeAndSweepEscrowsUnauthorized(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        uint256 preSweepVaultBal = underlyingToken.balanceOf(vaultProxyAddress);
        vm.recordLogs();
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );
        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(ETHEREUM_WETH, ETHEREUM_USDC)
        });

        // Check trying to call close and sweep again reverts
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__Sweep__EscrowAlreadyClosed.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Check number of (open) escrows correctly tracked
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 0, "EP has non-zero number of open escrows");

        // Check underlying was transferred from escrow to vault
        assertEq(underlyingToken.balanceOf(escrows[0]), 0, "Escrow underlying token balance is non-zero");
        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress) - preSweepVaultBal,
            optionInfo.notional,
            "Vault underlying token balance doesn't match notional"
        );

        // Check no settlement tokens should be in escrow
        assertEq(settlementToken.balanceOf(escrows[0]), 0, "Escrow settlement token balance is non-zero");
    }

    function test_createEscrowByTakingQuote_noExercise_withdrawFromEscrows_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        uint256 preVaultBal = underlyingToken.balanceOf(vaultProxyAddress);

        // Check initially no open escrows
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 0, "EP has open escrows");

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance is non-zero"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        uint256 postVaultBal = underlyingToken.balanceOf(vaultProxyAddress);

        // Check that myso v3 position lib contract should be set as escrow owner
        uint256 numEscrows = mysoRouter.numEscrows();
        address[] memory escrows = mysoRouter.getEscrows({_from: numEscrows - 1, _numElements: 1});
        address vaultOwner = IMysoV3Escrow(escrows[0]).owner();
        assertEq(vaultOwner, address(mysoV3OptionWritingPosition), "Escrow owner doesn't match EP");

        // Check underlying now in escrow
        assertEq(
            underlyingToken.balanceOf(escrows[0]),
            preVaultBal - postVaultBal,
            "Escrow underlying token balance doesn't match expected amount"
        );

        // Check number of (open) escrows updated correctly
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 1, "Number of open escrows mismatch");

        // Retrieve linked escrow indices
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        assertEq(escrows[0], linkedEscrowAddrs[0], "Escrow indices mismatch");

        // Similarly to previous test case, trying to withdraw from escrow prior to expiry should revert too
        address[] memory tokens = new address[](1);
        tokens[0] = optionInfo.underlyingToken;
        bytes4 expectedRevert = bytes4(keccak256("InvalidWithdraw()"));
        vm.expectRevert(abi.encodeWithSelector(expectedRevert));
        __withdrawFromEscrows(
            IMysoV3OptionWritingPositionProd.WithdrawTokensFromEscrowsActionArgs({escrows: escrows, tokens: tokens})
        );

        // Move forward past expiry to withdraw from escrows
        vm.warp(optionInfo.expiry + 1);

        // Check revert when escrows and tokens array lengths mismatch
        address[] memory emptyTokens = new address[](0);
        vm.expectRevert(IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__InputArraysLengthMismatch.selector);
        __withdrawFromEscrows(
            IMysoV3OptionWritingPositionProd.WithdrawTokensFromEscrowsActionArgs({escrows: escrows, tokens: emptyTokens})
        );

        uint256 preSweepVaultBal = underlyingToken.balanceOf(vaultProxyAddress);
        __withdrawFromEscrows(
            IMysoV3OptionWritingPositionProd.WithdrawTokensFromEscrowsActionArgs({escrows: escrows, tokens: tokens})
        );

        // Check balances
        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress) - preSweepVaultBal,
            optionInfo.notional,
            "Vault underlying token balance doesn't match notional"
        );
        assertEq(underlyingToken.balanceOf(escrows[0]), 0, "Escrow underlying token balance non-zero");
        assertEq(settlementToken.balanceOf(escrows[0]), 0, "Escrow settlement token balance non-zero");

        // Check withdrawing from escrow doesn't automatically mark it as closed
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 1, "Number of open escrows mismatch");

        // Check calling close and sweep after withdrawing from escrow works
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 0, "Number of open escrows is non-zero");

        // Check getManagedAssets doesn't revert when there are no open escrow
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            mysoV3OptionWritingPosition.getManagedAssets();
        assertEq(managedAssets.length, 0, "Managed assets length is non-zero");
        assertEq(managedAssetAmounts.length, 0, "Managed asset amounts length is non-zero");
    }

    function test_createEscrowByTakingQuote_noExercise_withPremiumPaidInUnderlying_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        optionInfo.advancedSettings.premiumTokenIsUnderlying = true;
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        uint256 preVaultBal = underlyingToken.balanceOf(vaultProxyAddress);

        // Fund trading firm with some underlying such that it has sufficient balance to pay option premium
        increaseTokenBalance({_token: underlyingToken, _to: tradingFirm, _amount: rfqQuote.premium});

        // Trading firm approves MYSO router
        vm.prank(tradingFirm);
        underlyingToken.approve(address(mysoRouter), type(uint256).max);

        // Fund owner initiates take quote, which:
        // 1) pulls underlying from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault underlying token balance doesn't match premium"
        ); // check premium has been received in vault

        uint256 postVaultBal = underlyingToken.balanceOf(vaultProxyAddress);

        // Check new escrow owner and balance change
        uint256 numEscrows = mysoRouter.numEscrows();
        address[] memory escrows = mysoRouter.getEscrows({_from: numEscrows - 1, _numElements: 1});
        address vaultOwner = IMysoV3Escrow(escrows[0]).owner();
        assertEq(vaultOwner, address(mysoV3OptionWritingPosition), "Escrow owner doesn't match EP"); // myso v3 position lib contract should be set as escrow owner
        assertEq(
            underlyingToken.balanceOf(escrows[0]),
            preVaultBal - postVaultBal + rfqQuote.premium,
            "Escrow underlying token balance mismatch"
        );
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 1, "Number of open escrows mismatch");
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        assertEq(escrows[0], linkedEscrowAddrs[0], "Escrow indices mismatch");

        // Close and sweep should revert prior to expiry
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Move forward past expiry to close and sweep
        vm.warp(optionInfo.expiry + 1);
        uint256 preSweepVaultBal = underlyingToken.balanceOf(vaultProxyAddress);
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );
        assertEq(mysoV3OptionWritingPosition.getNumOpenEscrows(), 0, "Number of open escrows is non-zero");
        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress) - preSweepVaultBal,
            optionInfo.notional,
            "Vault underlying token balance doesn't match notional"
        );
        assertEq(underlyingToken.balanceOf(escrows[0]), 0, "Escrow underlying token balance non-zero");
        assertEq(settlementToken.balanceOf(escrows[0]), 0, "Escrow settlement token balance non-zero");
    }

    function test_createEscrowByTakingQuote_fullExercise_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance non-zero"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        // Trading firm exercises 100% of option
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        bytes[] memory emptyOracleData = new bytes[](0);
        vm.prank(tradingFirm);
        mysoRouter.exercise({
            _escrow: linkedEscrowAddrs[0],
            _underlyingReceiver: tradingFirm,
            _underlyingAmount: optionInfo.notional,
            _payInSettlementToken: true,
            _oracleData: emptyOracleData
        });
        // Check conversion amount has been sent to position lib instance
        uint256 conversionAmount = optionInfo.notional * optionInfo.strike / assetUnit(underlyingToken);
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)),
            conversionAmount,
            "EP settlement token balance doesn't match conversion amount"
        );

        // Fund manager calls close and sweep upon 100% exercise
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Check settlement token amount was swept from escrow
        assertEq(settlementToken.balanceOf(linkedEscrowAddrs[0]), 0, "Escrow settlement token balance is non-zero");

        // Check conversion amount was swept from position lib instance to vault
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            conversionAmount + rfqQuote.premium,
            "Vault settlement token balance mismatch"
        );
    }

    function test_createEscrowByTakingQuote_fullExercise_griefingAttempt_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance is non-zero"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        // Trading firm exercises 100% of option
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        bytes[] memory emptyOracleData = new bytes[](0);
        vm.prank(tradingFirm);
        mysoRouter.exercise({
            _escrow: linkedEscrowAddrs[0],
            _underlyingReceiver: tradingFirm,
            _underlyingAmount: optionInfo.notional,
            _payInSettlementToken: true,
            _oracleData: emptyOracleData
        });
        // Check conversion amount has been sent to position lib instance
        uint256 conversionAmount = optionInfo.notional * optionInfo.strike / assetUnit(underlyingToken);
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)),
            conversionAmount,
            "EP settlement token balance doesn't match conversion amount"
        );

        // Fund manager wants to call close and sweep upon 100% exercise, however,
        // griefer attempts to front-run by donating small underlying token (or settlement token)
        // amount to escrow
        increaseTokenBalance({_token: underlyingToken, _to: linkedEscrowAddrs[0], _amount: 1});

        // Close and sweep will now fail
        bytes4 expectedRevert = bytes4(keccak256("InvalidWithdraw()"));
        vm.expectRevert(abi.encodeWithSelector(expectedRevert));
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Set skipWithdrawFromEscrow parameter to true to circumvent revert
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: true
            })
        );

        // Check settlement token amount was swept from escrow
        assertEq(settlementToken.balanceOf(linkedEscrowAddrs[0]), 0, "Escrow settlement token balance is non-zero");

        // Check conversion amount was swept from position lib instance to vault
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            conversionAmount + rfqQuote.premium,
            "Vault settlement token balance mismatch"
        );
    }

    function test_createEscrowByTakingQuote_partialExercise_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance is non-zero"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        // Trading firm exercises 40% of option
        uint256 exerciseAmount = optionInfo.notional * 4 / 10;
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        bytes[] memory emptyOracleData = new bytes[](0);
        vm.prank(tradingFirm);
        mysoRouter.exercise({
            _escrow: linkedEscrowAddrs[0],
            _underlyingReceiver: tradingFirm,
            _underlyingAmount: exerciseAmount,
            _payInSettlementToken: true,
            _oracleData: emptyOracleData
        });
        // Check conversion amount has been sent to position lib instance
        uint256 conversionAmount = exerciseAmount * optionInfo.strike / assetUnit(underlyingToken);
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)),
            conversionAmount,
            "EP settlement token balance doesn't match conversion amount"
        );

        // Close and sweep should revert prior to expiry in case of open unsettled option positions
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Move forward past expiry to close and sweep
        vm.warp(optionInfo.expiry + 1);

        // Fund manager calls close and sweep
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );
        assertEq(settlementToken.balanceOf(linkedEscrowAddrs[0]), 0, "Escrow settlement token balance non-zero"); // check settlement token amount was swept from escrow

        // check conversion amount was swept from position lib instance to vault
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            conversionAmount + rfqQuote.premium,
            "Vault settlement token balance mismatch"
        );
    }

    function test_createEscrowByTakingQuote_partialExercise_andWithdrawFromLib_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance is non-zero"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        // Trading firm exercises 40% of option
        uint256 exerciseAmount = optionInfo.notional * 4 / 10;
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        bytes[] memory emptyOracleData = new bytes[](0);
        vm.prank(tradingFirm);
        mysoRouter.exercise({
            _escrow: linkedEscrowAddrs[0],
            _underlyingReceiver: tradingFirm,
            _underlyingAmount: exerciseAmount,
            _payInSettlementToken: true,
            _oracleData: emptyOracleData
        });
        // Check conversion amount has been sent to position lib instance
        uint256 conversionAmount = exerciseAmount * optionInfo.strike / assetUnit(underlyingToken);
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)),
            conversionAmount,
            "EP settlement token balance doesn't match conversion amount"
        );

        // Fund manager calls __sweep to send partially converted amount from position lib instance to vault
        // Note: in contrast to __withdrawFromEscrows calling __sweep doesn't require waiting until expiry;
        // i.e., any conversion proceeds (as well as option premium amounts) held in the lib contract instance
        // can be transferred out independently of the option token expiry
        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        tokens[0] = optionInfo.settlementToken;
        amounts[0] = conversionAmount;
        vm.recordLogs();
        __sweep(IMysoV3OptionWritingPositionProd.SweepActionArgs({tokens: tokens}));
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        // Assert assetsToReceive was correctly formatted
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(optionInfo.settlementToken)
        });
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)),
            0,
            "EP settlement token balance is non-zero"
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium + conversionAmount,
            "Vault settlement token balance mismatch"
        );
    }

    function test_createEscrowByTakingQuote_borrowWithoutRepay_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote = __getDefaultSignedQuote(optionInfo);

        // Fund owner initiates take quote, which:
        // 1) pulls settlement token from trading firm to vault
        // 2) pulls underlying from vault to new escrow
        // 3) mints option token to trading firm
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance is non-zero"); // initially no premium
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo, rfqQuote: rfqQuote}),
                distPartner: address(0)
            })
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            rfqQuote.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        // Trading firm borrows
        uint128 borrowUnderlyingAmount = optionInfo.notional;
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});
        vm.prank(tradingFirm);
        mysoRouter.borrow({
            _escrow: linkedEscrowAddrs[0],
            _underlyingReceiver: tradingFirm,
            _borrowUnderlyingAmount: borrowUnderlyingAmount
        });
        // Check collateral amount has been sent to escrow
        uint256 collateralAmount = borrowUnderlyingAmount * optionInfo.strike / assetUnit(underlyingToken);
        assertEq(
            settlementToken.balanceOf(linkedEscrowAddrs[0]),
            collateralAmount,
            "Escrow settlement token balance doesn't match collateral amount"
        );

        // Close and sweep should revert prior to expiry in case of open unsettled option positions
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Move forward past expiry to close and sweep
        vm.warp(optionInfo.expiry + 1);

        // Fund manager calls close and sweep
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );
        assertEq(settlementToken.balanceOf(linkedEscrowAddrs[0]), 0, "Escrow settlement token balance non-zero"); // check collateral amount was swept from escrow

        // Check collateral amount was swept from escrow to vault
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            collateralAmount + rfqQuote.premium,
            "Vault settlement totken balance mismatch"
        );
    }

    function test_createEscrowByCreatingAuction_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.AuctionInitialization memory auctionInitialization =
            __getDefaultAuctionInitialization(optionInfo);
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByStartingAuction(
            IMysoV3OptionWritingPositionProd.CreateEscrowByStartingAuctionActionArgs({
                auctionInitialization: auctionInitialization,
                distPartner: address(0)
            })
        );

        // Get newly created escrow
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});

        // Check underlying is in escrow
        assertEq(
            underlyingToken.balanceOf(linkedEscrowAddrs[0]),
            optionInfo.notional,
            "Escrow underlying token balance doesn't match notional"
        );

        // Check no option premium in vault nor in position lib
        assertEq(settlementToken.balanceOf(vaultProxyAddress), 0, "Vault settlement token balance non-zero");
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)), 0, "EP settlement token balance non-zero"
        );

        // Preview bid
        uint256 relBid = type(uint256).max; // @dev: for slippage control
        uint256 refSpot = type(uint256).max; // @dev: for slippage control
        bytes[] memory emptyOracleData = new bytes[](0);
        (IMysoV3DataTypes.BidPreview memory bidPreview,) = IMysoV3Escrow(linkedEscrowAddrs[0]).previewBid({
            _relBid: relBid,
            _refSpot: refSpot,
            _oracleData: emptyOracleData
        });

        // Trading firm bids on auction
        vm.prank(tradingFirm);
        mysoRouter.bidOnAuction({
            _escrow: linkedEscrowAddrs[0],
            _optionReceiver: tradingFirm,
            _relBid: relBid,
            _refSpot: refSpot,
            _oracleData: emptyOracleData
        });

        // Check option premium now in position lib
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)),
            bidPreview.premium,
            "EP settlement token balance doesn't match premium"
        );

        // Trading firm tries to bid again should fail
        vm.prank(tradingFirm);
        bytes4 expectedRevert = bytes4(keccak256("InvalidBid()"));
        vm.expectRevert(abi.encodeWithSelector(expectedRevert));
        mysoRouter.bidOnAuction({
            _escrow: linkedEscrowAddrs[0],
            _optionReceiver: tradingFirm,
            _relBid: relBid,
            _refSpot: refSpot,
            _oracleData: emptyOracleData
        });

        // Close and sweep should revert prior to expiry in case of open unsettled option positions
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__CloseAndSweep__NotExpiredOption.selector
        );
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Fund manager withdraws premium from position lib to vault;
        // in contrast to __closeAndSweepEscrows this can be done prior to expiry
        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        tokens[0] = optionInfo.settlementToken;
        amounts[0] = bidPreview.premium;
        __sweep(IMysoV3OptionWritingPositionProd.SweepActionArgs({tokens: tokens}));

        // Check option premium not in position lib anymore but now in vault
        assertEq(
            settlementToken.balanceOf(address(mysoV3OptionWritingPosition)), 0, "EP settlement token balance non-zero"
        );
        assertEq(
            settlementToken.balanceOf(vaultProxyAddress),
            bidPreview.premium,
            "Vault settlement token balance doesn't match premium"
        );

        // Move forward past expiry to close and sweep
        vm.warp(optionInfo.expiry + 1);

        // Fund manager calls close and sweep
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Check underlying amount was swept from escrow to vault
        assertEq(underlyingToken.balanceOf(linkedEscrowAddrs[0]), 0, "Escrow underlying token balance non-zero");
        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress),
            optionInfo.notional,
            "Vault underlying token balance doesn't match notional"
        );
    }

    function test_createEscrowByCreatingAuction_andCancel_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo = __getDefaultOptionInfo();
        IMysoV3DataTypesProd.AuctionInitialization memory auctionInitialization =
            __getDefaultAuctionInitialization(optionInfo);
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByStartingAuction(
            IMysoV3OptionWritingPositionProd.CreateEscrowByStartingAuctionActionArgs({
                auctionInitialization: auctionInitialization,
                distPartner: address(0)
            })
        );

        // Check getManagedAssets should revert as long as there's an open escrow
        vm.expectRevert(
            IMysoV3OptionWritingPositionLib.MysoV3OptionWritingPosition__GetManagedAssets__OpenEscrowsExist.selector
        );
        mysoV3OptionWritingPosition.getManagedAssets();

        // Get newly created escrow
        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 1});
        address[] memory linkedEscrowAddrs =
            mysoRouter.getEscrows({_from: uint256(linkedEscrowIndices[0]), _numElements: 1});

        // Check underlying is in escrow
        assertEq(
            underlyingToken.balanceOf(linkedEscrowAddrs[0]),
            optionInfo.notional,
            "Escrow underlying token balance doesn't match notional"
        );

        // Fund manager cancels auction by withdrawing before any match;
        // this is possible as long as no option token was minted yet
        uint256 preVaultBal = underlyingToken.balanceOf(vaultProxyAddress);
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );

        // Check underlying amount was swept from escrow to vault
        assertEq(underlyingToken.balanceOf(linkedEscrowAddrs[0]), 0, "Escrow underlying token balance non-zero");
        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress) - preVaultBal,
            optionInfo.notional,
            "Vault underlying token balance doesn't match notional"
        );

        // Check getManagedAssets doesn't revert when there are no open escrows
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            mysoV3OptionWritingPosition.getManagedAssets();
        assertEq(managedAssets.length, 0, "Managed assets length non-zero");
        assertEq(managedAssetAmounts.length, 0, "Managed asset amounts length non-zero");
    }

    function test_sellTwoOptionsAndClose_success() public {
        // Define option and quote to be traded
        IMysoV3DataTypesProd.OptionInfo memory optionInfo1 = __getDefaultOptionInfo(ETHEREUM_MLN, ETHEREUM_WETH, true);
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote1 = __getDefaultSignedQuote(optionInfo1);

        IMysoV3DataTypesProd.OptionInfo memory optionInfo2 = __getDefaultOptionInfo(ETHEREUM_MLN, ETHEREUM_USDC, true);
        IMysoV3DataTypesProd.RFQQuote memory rfqQuote2 = __getDefaultSignedQuote(optionInfo2);

        // Increase MLN balance with vault
        increaseTokenBalance({
            _token: IERC20(optionInfo1.underlyingToken),
            _to: vaultProxyAddress,
            _amount: optionInfo1.notional + optionInfo2.notional
        });

        // Increase MLN balance with trading firm to be able to pay premium
        increaseTokenBalance({
            _token: IERC20(optionInfo1.underlyingToken),
            _to: tradingFirm,
            _amount: rfqQuote1.premium + rfqQuote2.premium
        });
        increaseTokenBalance({_token: IERC20(optionInfo1.settlementToken), _to: tradingFirm, _amount: type(uint128).max});
        increaseTokenBalance({_token: IERC20(optionInfo2.settlementToken), _to: tradingFirm, _amount: type(uint128).max});
        vm.prank(tradingFirm);
        IERC20(optionInfo1.underlyingToken).approve(address(mysoRouter), type(uint256).max);
        vm.prank(tradingFirm);
        IERC20(optionInfo1.settlementToken).approve(address(mysoRouter), type(uint256).max);
        vm.prank(tradingFirm);
        IERC20(optionInfo2.settlementToken).approve(address(mysoRouter), type(uint256).max);

        // Sell option 1: underlying token = MLN, settlement token = ETH
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo1, rfqQuote: rfqQuote1}),
                distPartner: address(0)
            })
        );

        // Sell option 2: underlying token = MLN, settlement token = USDC
        vm.expectEmit();
        emit EscrowCreated(mysoRouter.numEscrows());
        __createEscrowByTakingQuote(
            IMysoV3OptionWritingPositionProd.CreateEscrowByTakingQuoteActionArgs({
                rfqInitialization: IMysoV3DataTypesProd.RFQInitialization({optionInfo: optionInfo2, rfqQuote: rfqQuote2}),
                distPartner: address(0)
            })
        );
        assertEq(
            IERC20(optionInfo2.underlyingToken).balanceOf(vaultProxyAddress),
            rfqQuote1.premium + rfqQuote2.premium,
            "Vault settlement token balance doesn't match premium"
        ); // check premium has been received in vault

        // Trading firm exercises both options
        address[] memory linkedEscrowAddrs = mysoRouter.getEscrows({_from: 0, _numElements: 2});
        bytes[] memory emptyOracleData = new bytes[](0);
        vm.prank(tradingFirm);
        mysoRouter.exercise({
            _escrow: linkedEscrowAddrs[0],
            _underlyingReceiver: tradingFirm,
            _underlyingAmount: optionInfo1.notional,
            _payInSettlementToken: true,
            _oracleData: emptyOracleData
        });
        vm.prank(tradingFirm);
        mysoRouter.exercise({
            _escrow: linkedEscrowAddrs[1],
            _underlyingReceiver: tradingFirm,
            _underlyingAmount: optionInfo2.notional,
            _payInSettlementToken: true,
            _oracleData: emptyOracleData
        });

        uint32[] memory linkedEscrowIndices = mysoV3OptionWritingPosition.getEscrowIdxs({_from: 0, _numElements: 2});
        vm.recordLogs();
        vm.expectEmit();
        emit EscrowClosedAndSwept(linkedEscrowIndices[0]);
        emit EscrowClosedAndSwept(linkedEscrowIndices[1]);
        __closeAndSweepEscrows(
            IMysoV3OptionWritingPositionProd.CloseAndSweepEscrowActionArgs({
                escrowIdxs: linkedEscrowIndices,
                skipWithdrawFromEscrow: false
            })
        );
        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(ETHEREUM_MLN, ETHEREUM_WETH, ETHEREUM_USDC)
        });
    }
}

abstract contract MysoV3OptionWritingPositionEthereumTestBase is MysoV3OptionWritingPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ETHEREUM_CHAIN_ID,
            _version: _version,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE_MYSO_V3,
            _underlyingTokenAddress: ETHEREUM_WETH,
            _settlementTokenAddress: ETHEREUM_USDC,
            _mysoRouterAddress: ETHEREUM_MYSO_ROUTER_V3
        });
    }
}

contract MysoV3OptionWritingPositionEthereumTest is MysoV3OptionWritingPositionEthereumTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current});
    }
}

contract MysoV3OptionWritingPositionEthereumTestV4 is MysoV3OptionWritingPositionEthereumTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4});
    }
}
