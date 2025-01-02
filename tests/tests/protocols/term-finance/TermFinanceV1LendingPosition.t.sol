// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ITermFinanceV1LendingPosition as ITermFinanceV1LendingPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/term-finance-v1-lending/ITermFinanceV1LendingPosition.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ITermFinanceV1Auction} from "tests/interfaces/external/ITermFinanceV1Auction.sol";
import {ITermFinanceV1BidLocker} from "tests/interfaces/external/ITermFinanceV1BidLocker.sol";
import {ITermFinanceV1OfferLocker} from "tests/interfaces/external/ITermFinanceV1OfferLocker.sol";
import {ITermFinanceV1RepoServicer} from "tests/interfaces/external/ITermFinanceV1RepoServicer.sol";
import {ITermFinanceV1RepoToken} from "tests/interfaces/external/ITermFinanceV1RepoToken.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {ITermFinanceV1LendingPositionLib} from "tests/interfaces/internal/ITermFinanceV1LendingPositionLib.sol";
import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";

address constant TERM_FINANCE_CONTROLLER_ADDRESS = 0x62f476DBB9B60D9272e26994525F4Db80Fd543e4;
address constant TERM_FINANCE_AUCTION_ADDRESS_1 = 0x52B021153cB52815f831b120516Aab32A4B910B2; // PurchaseToken: Weth
address constant TERM_FINANCE_AUCTION_ADDRESS_2 = 0xBc0d3e0A0133b99c3c42E15b26012126FbAdD170; // PurchaseToken: USDc
address constant TERM_FINANCE_AUCTION_ADDRESS_3 = 0x6091D92A4AbcCeE4a218Ee84248E8469cfb6d71c; // PurchaseToken: USDc
address constant TERM_FINANCE_ADMIN_ADDRESS = 0x73d1C7dc9CEb14660Cf1E9BB29F80ECF9E97D774;
address constant TERM_FINANCE_REPO_SERVICER_1 = 0xA0501f923E3CCf4d0907eC2c3b64d24d23d4d971; // Servicer contract for auction 1

// Used for hashing and then revealing prices
uint256 constant PRICE_NONCE = 42;

////////////////
// TEST BASES //
////////////////

abstract contract TestBase is IntegrationTest {
    event OfferAdded(address indexed termFinanceAuction, bytes32 indexed offerId);

    event OfferRemoved(address indexed termFinanceAuction, bytes32 indexed offerId);

    event TermAuctionAdded(address indexed termAuction);

    event TermAuctionRemoved(address indexed termAuction);

    ITermFinanceV1LendingPositionLib internal termFinanceLendingPosition;

    address internal fundOwner;
    address internal comptrollerProxyAddress;
    address internal vaultProxyAddress;

    ITermFinanceV1Auction[] internal termFinanceAuctions;
    address[] internal purchaseTokens;

    ITermFinanceV1Auction internal termFinanceAuction;
    IERC20 internal purchaseToken;

    // Set by child contract
    EnzymeVersion internal version;

    function setUp() public virtual override {
        termFinanceAuctions.push(ITermFinanceV1Auction(TERM_FINANCE_AUCTION_ADDRESS_1));
        termFinanceAuctions.push(ITermFinanceV1Auction(TERM_FINANCE_AUCTION_ADDRESS_2));
        termFinanceAuctions.push(ITermFinanceV1Auction(TERM_FINANCE_AUCTION_ADDRESS_3));

        purchaseTokens = new address[](termFinanceAuctions.length);
        for (uint256 i; i < termFinanceAuctions.length; i++) {
            purchaseTokens[i] = termFinanceAuctions[i].purchaseToken();
        }

        // Using the first termAuction as default, as most tests only use one termFinanceAuction.
        termFinanceAuction = termFinanceAuctions[0];
        purchaseToken = IERC20(purchaseTokens[0]);

        // If v4, register purchaseTokens to pass the asset universe validation
        if (version == EnzymeVersion.V4) {
            for (uint256 i; i < purchaseTokens.length; i++) {
                v4AddPrimitiveWithTestAggregator({_tokenAddress: purchaseTokens[i], _skipIfRegistered: true});
            }
        }

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Seed the vault with purchase tokens
        for (uint256 i; i < purchaseTokens.length; i++) {
            increaseTokenBalance({
                _token: IERC20(purchaseTokens[i]),
                _to: vaultProxyAddress,
                _amount: assetUnit(IERC20(purchaseTokens[i])) * 4321
            });
        }

        // Deploy all position dependencies
        uint256 typeId = __deployPositionType();

        // Create a TermFinanceV1LendingPosition for the fund
        vm.prank(fundOwner);
        termFinanceLendingPosition = ITermFinanceV1LendingPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS

    function __deployLib() internal returns (address libAddress_) {
        address referrer = address(0);
        bytes memory args = abi.encode(referrer);
        return deployCode("TermFinanceV1LendingPositionLib.sol", args);
    }

    function __deployParser() internal returns (address parserAddress_) {
        bytes memory args = abi.encode(TERM_FINANCE_CONTROLLER_ADDRESS);

        return deployCode("TermFinanceV1LendingPositionParser.sol", args);
    }

    function __deployPositionType() internal returns (uint256 typeId_) {
        // Deploy position contracts
        address libAddress = __deployLib();
        address parserAddress = __deployParser();

        // Register position type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "TERM_FINANCE_V1_LENDING",
            _lib: libAddress,
            _parser: parserAddress
        });

        return typeId_;
    }

    // ACTION HELPERS

    function __addOrUpdateOffers(
        ITermFinanceV1Auction _termFinanceAuction,
        bytes32[] memory _offerIds,
        uint256[] memory _offerPrices,
        int256[] memory _amountsChange
    ) internal {
        bytes32[] memory offerPriceHashes = __getPriceHashes(_offerPrices);
        bytes memory actionArgs = abi.encode(_termFinanceAuction, _offerIds, offerPriceHashes, _amountsChange);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(termFinanceLendingPosition),
            _actionId: uint256(ITermFinanceV1LendingPositionProd.Actions.AddOrUpdateOffers),
            _actionArgs: actionArgs
        });
    }

    function __removeOffers(ITermFinanceV1Auction _termFinanceAuction, bytes32[] memory _offerIds) internal {
        bytes memory actionArgs = abi.encode(_termFinanceAuction, _offerIds);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(termFinanceLendingPosition),
            _actionId: uint256(ITermFinanceV1LendingPositionProd.Actions.RemoveOffers),
            _actionArgs: actionArgs
        });
    }

    function __redeem(ITermFinanceV1Auction _termFinanceAuction, uint256 _amount) internal {
        bytes memory actionArgs = abi.encode(_termFinanceAuction, _amount);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(termFinanceLendingPosition),
            _actionId: uint256(ITermFinanceV1LendingPositionProd.Actions.Redeem),
            _actionArgs: actionArgs
        });
    }

    function __sweep(ITermFinanceV1Auction[] memory _termFinanceAuctions) internal {
        bytes memory actionArgs = abi.encode(_termFinanceAuctions);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(termFinanceLendingPosition),
            _actionId: uint256(ITermFinanceV1LendingPositionProd.Actions.Sweep),
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    /// @dev Logic copied from: https://github.com/term-finance/term-finance-contracts/blob/f766367dfc33ba7b93f6e29f27f12e65c132d242/contracts/TermAuctionBidLocker.sol#L946
    function __generateBidId(ITermFinanceV1Auction _termFinanceAuction, address _sender, bytes32 _idSeed)
        internal
        view
        returns (bytes32 id_)
    {
        id_ = keccak256(abi.encodePacked(_idSeed, _sender, _termFinanceAuction.termAuctionBidLocker()));

        return id_;
    }

    /// @dev Logic copied from: https://github.com/term-finance/term-finance-contracts/blob/f766367dfc33ba7b93f6e29f27f12e65c132d242/contracts/TermAuctionOfferLocker.sol#L503
    function __generateOfferId(ITermFinanceV1Auction _termFinanceAuction, bytes32 _idSeed)
        internal
        view
        returns (bytes32 id_)
    {
        id_ = keccak256(
            abi.encodePacked(_idSeed, termFinanceLendingPosition, _termFinanceAuction.termAuctionOfferLocker())
        );

        return id_;
    }

    function __getPriceHashes(uint256[] memory _offerPrices)
        internal
        pure
        returns (bytes32[] memory offerPriceHashes_)
    {
        offerPriceHashes_ = new bytes32[](_offerPrices.length);

        for (uint256 i; i < _offerPrices.length; i++) {
            offerPriceHashes_[i] = keccak256(abi.encode(_offerPrices[i], PRICE_NONCE));
        }

        return offerPriceHashes_;
    }
}

/////////////
// ACTIONS //
/////////////

abstract contract AddReplaceAndRemoveOffersTest is TestBase {
    bytes32[] offerIdSeeds = toArray(bytes32("123"), bytes32("456"), bytes32("789"));
    bytes32[] generatedOfferIds = new bytes32[](offerIdSeeds.length);
    uint256[] offerPrices = new uint256[](offerIdSeeds.length);
    int256[] offerAmounts = new int256[](offerIdSeeds.length);

    // Helper to assign offers data
    function __setUpOffers() internal {
        for (uint256 i; i < offerIdSeeds.length; i++) {
            generatedOfferIds[i] =
                __generateOfferId({_termFinanceAuction: termFinanceAuction, _idSeed: offerIdSeeds[i]});

            offerPrices[i] = WEI_ONE_PERCENT * (i + 1);
            offerAmounts[i] = int256(assetUnit(purchaseToken) * (i + 1));
        }

        // Warp time to auction start time
        vm.warp(ITermFinanceV1OfferLocker(termFinanceAuction.termAuctionOfferLocker()).auctionStartTime() + 1);
    }

    function test_addOffers_success() public {
        // Create a few offers
        __setUpOffers();

        uint256 vaultPurchaseTokenBalancePre = purchaseToken.balanceOf(vaultProxyAddress);

        expectEmit(address(termFinanceLendingPosition));
        emit TermAuctionAdded(address(termFinanceAuction));

        for (uint256 i; i < offerIdSeeds.length; i++) {
            expectEmit(address(termFinanceLendingPosition));
            emit OfferAdded(address(termFinanceAuction), generatedOfferIds[i]);
        }

        vm.recordLogs();

        // Add the offers
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: offerIdSeeds,
            _offerPrices: offerPrices,
            _amountsChange: offerAmounts
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        uint256 vaultPurchaseTokenBalancePost = purchaseToken.balanceOf(vaultProxyAddress);

        // Assert that the term auction has been added to storage
        address[] memory retrievedTermAuctions = termFinanceLendingPosition.getTermAuctions();
        assertEq(retrievedTermAuctions.length, 1, "Incorrect number of term auctions retrieved");
        assertEq(retrievedTermAuctions[0], address(termFinanceAuction), "Incorrect termAuction address retrieved");

        bytes32[] memory retrievedOfferIds =
            termFinanceLendingPosition.getOfferIdsFromTermAuction(address(termFinanceAuction));

        // Assert that the offerIds have been added to storage
        assertEq(retrievedOfferIds.length, offerIdSeeds.length, "Incorrect number of offerIds retrieved");
        for (uint256 i; i < offerIdSeeds.length; i++) {
            assertEq(retrievedOfferIds[i], generatedOfferIds[i], "Incorrect offerId retrieved");
            // Also assert that these offerIds have also been added to Term
            ITermFinanceV1OfferLocker.TermAuctionOffer memory offer =
                ITermFinanceV1OfferLocker(termFinanceAuction.termAuctionOfferLocker()).lockedOffer(retrievedOfferIds[i]);

            assertEq(offer.amount, uint256(offerAmounts[i]), "Incorrect offer amount retrieved from Term");
            assertEq(offer.offerPriceHash, __getPriceHashes(offerPrices)[i], "Incorrect offer price hash from Term");
        }

        int256 sumOfAmounts;
        for (uint256 i; i < offerAmounts.length; i++) {
            sumOfAmounts += offerAmounts[i];
        }

        // Vault purchaseToken balance should have decreased by the sum of amounts
        assertEq(
            vaultPurchaseTokenBalancePre - vaultPurchaseTokenBalancePost,
            uint256(sumOfAmounts),
            "Incorrect vault balance"
        );

        // Assert that getManagedAssets returns the correct values
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            termFinanceLendingPosition.getManagedAssets();

        assertEq(managedAssets, toArray(address(purchaseToken)), "Incorrect managedAsset retrieved");
        assertEq(managedAssetAmounts, toArray(uint256(sumOfAmounts)), "Incorrect managedAssetAmount retrieved");
    }

    function test_replaceOffer_success() public {
        __setUpOffers();

        // Add some offers
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: offerIdSeeds,
            _offerPrices: offerPrices,
            _amountsChange: offerAmounts
        });

        // Replace the first offer with a higher amount
        uint256 updatedOfferPrice = offerPrices[0] * 3;
        int256[] memory increasedAmountsChange = new int256[](1);
        increasedAmountsChange[0] = offerAmounts[0] * 3;

        uint256 vaultPurchaseTokenBalancePre = purchaseToken.balanceOf(vaultProxyAddress);

        // Replace the offer with the AddOffer action using an existing offerId
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: toArray(generatedOfferIds[0]),
            _offerPrices: toArray(updatedOfferPrice),
            _amountsChange: increasedAmountsChange
        });

        uint256 vaultPurchaseTokenBalancePostOfferIncrease = purchaseToken.balanceOf(vaultProxyAddress);

        // Assert that the vault's balance has decreased by the delta of the replaced offer amount
        assertEq(
            vaultPurchaseTokenBalancePre - vaultPurchaseTokenBalancePostOfferIncrease,
            uint256(increasedAmountsChange[0]),
            "Incorrect vault balance post offer increase"
        );

        int256[] memory decreasedAmountsChange = new int256[](1);
        decreasedAmountsChange[0] = -(offerAmounts[0] / 5);
        // Replace the offer with the AddOffer action using an existing offerId

        address[] memory termAuctionsPreUpdate = termFinanceLendingPosition.getTermAuctions();
        bytes32[] memory offerIdsPreUpdate =
            termFinanceLendingPosition.getOfferIdsFromTermAuction(address(termFinanceAuction));

        vm.recordLogs();

        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: toArray(generatedOfferIds[0]),
            _offerPrices: toArray(updatedOfferPrice),
            _amountsChange: decreasedAmountsChange
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(purchaseToken))
        });

        address[] memory termAuctionsPostUpdate = termFinanceLendingPosition.getTermAuctions();
        bytes32[] memory offerIdsPostUpdate =
            termFinanceLendingPosition.getOfferIdsFromTermAuction(address(termFinanceAuction));

        uint256 vaultPurchaseTokenBalancePostOfferDecrease = purchaseToken.balanceOf(vaultProxyAddress);
        // Assert that the vault's balance has increased by the delta of the replaced offer amount
        assertEq(
            vaultPurchaseTokenBalancePostOfferDecrease - vaultPurchaseTokenBalancePostOfferIncrease,
            uint256(-decreasedAmountsChange[0]),
            "Incorrect vault balance post offer decrease"
        );

        // Assert that the termAuctions and offerIds in storage have not change
        assertEq(termAuctionsPreUpdate, termAuctionsPostUpdate, "Incorrect termAuctions in storage");
        assertEq(offerIdsPreUpdate.length, offerIdsPostUpdate.length, "Incorrect offerIds length in storage");
        for (uint256 i; i < offerIdsPreUpdate.length; i++) {
            assertEq(offerIdsPreUpdate[i], offerIdsPostUpdate[i], "Incorrect offerIds in storage");
        }
    }

    function test_addOrUpdateOffers_failsAddEmptyOffersArray() public {
        vm.expectRevert(formatError("__addOrUpdateOffers: Empty submittedOfferIds"));

        // Call AddOrUpdate action with an empty offers array
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: new bytes32[](0),
            _offerPrices: new uint256[](0),
            _amountsChange: new int256[](0)
        });
    }

    function test_addOrUpdateOffers_failsAddAndUpdateSameOffer() public {
        __setUpOffers();

        vm.expectRevert(formatError("__addOrUpdateOffers: Duplicate offerIds"));

        // Add and update the same termAuction in a single tx
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: toArray(offerIdSeeds[0], generatedOfferIds[0], generatedOfferIds[0]),
            _offerPrices: offerPrices,
            _amountsChange: offerAmounts
        });
    }

    function test_addOrUpdateOffers_failsUnequalLength() public {
        __setUpOffers();

        vm.expectRevert("parseAssetsForAction: Unequal arrays");

        // Add 1 offerId but provide 3 offerPrices and amountsChange.
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: toArray(offerIdSeeds[0]),
            _offerPrices: offerPrices,
            _amountsChange: offerAmounts
        });
    }

    function test_removeOffers_success() public {
        // Add a few offers
        __setUpOffers();

        // Add some offers
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: offerIdSeeds,
            _offerPrices: offerPrices,
            _amountsChange: offerAmounts
        });

        bytes32[] memory offerIdsToRemain = toArray(generatedOfferIds[0]);
        bytes32[] memory offerIdsToRemove = toArray(generatedOfferIds[1], generatedOfferIds[2]);
        uint256 amountToRemove;
        for (uint256 i; i < offerIdsToRemove.length; i++) {
            amountToRemove += ITermFinanceV1OfferLocker(termFinanceAuction.termAuctionOfferLocker()).lockedOffer({
                _offerId: offerIdsToRemove[i]
            }).amount;
        }

        uint256 vaultPurchaseTokenBalancePre = purchaseToken.balanceOf(vaultProxyAddress);

        for (uint256 i; i < offerIdsToRemove.length; i++) {
            expectEmit(address(termFinanceLendingPosition));
            emit OfferRemoved(address(termFinanceAuction), offerIdsToRemove[i]);
        }

        vm.recordLogs();

        // Remove some of these offers
        __removeOffers({_termFinanceAuction: termFinanceAuction, _offerIds: offerIdsToRemove});

        uint256 vaultPurchaseTokenBalancePost = purchaseToken.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(purchaseToken))
        });

        // Assert that the removed offers have been refunded to the vault

        assertEq(
            vaultPurchaseTokenBalancePost - vaultPurchaseTokenBalancePre,
            uint256(amountToRemove),
            "Incorrect vault balance"
        );

        // Assert that the removed offers were removed from storage
        bytes32[] memory retrievedOfferIds =
            termFinanceLendingPosition.getOfferIdsFromTermAuction(address(termFinanceAuction));
        assertEq(retrievedOfferIds.length, 1, "Incorrect number of offerIds retrieved");
        assertEq(retrievedOfferIds[0], offerIdsToRemain[0], "Incorrect offerId retrieved");

        // Remove the last offer. This should remove the TermAuction from storage.
        expectEmit(address(termFinanceLendingPosition));
        emit OfferRemoved(address(termFinanceAuction), offerIdsToRemain[0]);
        expectEmit(address(termFinanceLendingPosition));
        emit TermAuctionRemoved(address(termFinanceAuction));

        __removeOffers({_termFinanceAuction: termFinanceAuction, _offerIds: offerIdsToRemain});
    }
}

abstract contract RedeemTest is TestBase {
    ITermFinanceV1RepoServicer termRepoServicer;
    ITermFinanceV1RepoToken repoToken;
    address bidder;
    uint256 offerAndBidAmount;
    uint256 price;
    IERC20 collateralToken;
    uint256 collateralAmount;
    uint256 termStart;

    // This helper creates an offer (lend-side) and a bid (borrow-side) with matching prices
    // It then completes the auction, which fills the offer/bid and begins the lending term.
    function __createFulfilledAuction() private {
        termRepoServicer = ITermFinanceV1RepoServicer(termFinanceAuction.termRepoServicer());
        repoToken = ITermFinanceV1RepoToken(termRepoServicer.termRepoToken());
        // TermStart is 1 second after auctionEndTime
        termStart = termFinanceAuction.auctionEndTime() + 1;
        // In TermFinance, a price of 10% represents a 10% increase over 360 days
        price = WEI_ONE_PERCENT * 10;
        // This amount will be used for both the offer and the bid
        int256[] memory offerAndBidAmounts = new int256[](1);
        offerAndBidAmounts[0] = int256(assetUnit(purchaseToken) * 1234);
        offerAndBidAmount = uint256(offerAndBidAmounts[0]);
        bytes32 offerIdSeed = bytes32("123");
        bytes32 generatedOfferId = __generateOfferId({_termFinanceAuction: termFinanceAuction, _idSeed: offerIdSeed});

        vm.warp(ITermFinanceV1OfferLocker(termFinanceAuction.termAuctionOfferLocker()).auctionStartTime() + 1);

        // Add an offer
        __addOrUpdateOffers({
            _termFinanceAuction: termFinanceAuction,
            _offerIds: toArray(offerIdSeed),
            _offerPrices: toArray(price),
            _amountsChange: offerAndBidAmounts
        });

        ITermFinanceV1BidLocker bidLocker = ITermFinanceV1BidLocker(termFinanceAuction.termAuctionBidLocker());
        bidder = makeAddr("Bidder");
        bytes32 bidIdSeed = bytes32("1234");
        bytes32 generatedBidId =
            __generateBidId({_termFinanceAuction: termFinanceAuction, _sender: bidder, _idSeed: bidIdSeed});

        ITermFinanceV1BidLocker.TermAuctionBidSubmission[] memory bidSubmissions =
            new ITermFinanceV1BidLocker.TermAuctionBidSubmission[](1);

        // Collateral token of first auction is wsteth
        collateralToken = IERC20(ETHEREUM_WSTETH);
        collateralAmount = assetUnit(collateralToken) * 100_000;

        bidSubmissions[0] = ITermFinanceV1BidLocker.TermAuctionBidSubmission({
            id: bidIdSeed,
            bidder: bidder,
            bidPriceHash: __getPriceHashes(toArray(price))[0],
            amount: offerAndBidAmount,
            collateralAmounts: toArray(collateralAmount),
            purchaseToken: address(purchaseToken),
            collateralTokens: toArray(address(collateralToken))
        });

        // Seed the bidder with some collateral and purchaseToken (for repayment the loan at maturity)
        increaseTokenBalance({_token: collateralToken, _to: bidder, _amount: collateralAmount});
        increaseTokenBalance({_token: purchaseToken, _to: bidder, _amount: offerAndBidAmount * 1234});
        // Approve termRepoLocker to spend the collateral and the purchaseToken (for repaying the loan)
        vm.startPrank(bidder);
        collateralToken.approve(termRepoServicer.termRepoLocker(), collateralAmount);
        bidLocker.lockBids({_bidSubmissions: bidSubmissions});
        purchaseToken.approve(termRepoServicer.termRepoLocker(), type(uint256).max);
        vm.stopPrank();

        // Warm time to reveal time
        vm.warp(bidLocker.revealTime());

        // Reveal the offer
        ITermFinanceV1OfferLocker(termFinanceAuction.termAuctionOfferLocker()).revealOffers({
            _ids: toArray(generatedOfferId),
            _prices: toArray(price),
            _nonces: toArray(PRICE_NONCE)
        });

        // Reveal the bid
        bidLocker.revealBids({_ids: toArray(generatedBidId), _prices: toArray(price), _nonces: toArray(PRICE_NONCE)});

        // Warp the time to after the auctionEndTIme
        vm.warp(termFinanceAuction.auctionEndTime() + 1);

        // Complete the auction
        termFinanceAuction.completeAuction({
            _completeAuctionInput: ITermFinanceV1Auction.CompleteAuctionInput({
                revealedBidSubmissions: toArray(generatedBidId),
                expiredRolloverBids: new bytes32[](0),
                unrevealedBidSubmissions: new bytes32[](0),
                revealedOfferSubmissions: toArray(generatedOfferId),
                unrevealedOfferSubmissions: new bytes32[](0)
            })
        });
    }

    function test_success() public {
        __createFulfilledAuction();

        uint256 bufferPercentInWei = WEI_ONE_PERCENT / 1_000_000; // 0.0001bps
        uint256 SCALING_FACTOR = 1e18;

        // EP should now hold the repoToken
        uint256 repoTokenBalance = IERC20(address(repoToken)).balanceOf(address(termFinanceLendingPosition));

        {
            // Warp time to the termStart
            vm.warp(termStart);

            // Assert that getManagedAssets reflects the present value of the repoToken
            (address[] memory preRedemptionTimeManagedAssets, uint256[] memory preRedemptionTimeManagedAssetAmounts) =
                termFinanceLendingPosition.getManagedAssets();

            // The repoToken represents the future value of the purchaseToken
            // The present value should be equal to the purchaseToken provided (since no time has elapsed)
            assertEq(
                preRedemptionTimeManagedAssetAmounts.length,
                1,
                "Incorrect number of pre-redemption time managedAssetAmounts"
            );
            assertEq(
                preRedemptionTimeManagedAssets,
                toArray(address(purchaseToken)),
                "Incorrect pre-redemption time managedAsset"
            );
            assertApproxEqRel(
                preRedemptionTimeManagedAssetAmounts[0],
                offerAndBidAmount,
                bufferPercentInWei,
                "Incorrect pre-redemption time managedAssetValue"
            );
        }

        // Value of the EP should increase as the repoToken appreciates
        {
            vm.warp(termStart + SECONDS_ONE_DAY);

            // Calculate a partialDayCountFractionMantissa
            // Copied from Term's logic: https://github.com/term-finance/term-finance-contracts/blob/47d0675c92aac3b55663a6e0065a6f3a85998e07/contracts/TermAuction.sol#L157-L159
            uint256 partialDayCountFractionMantissa = ((block.timestamp - termStart) * SCALING_FACTOR) / 360 days;

            uint256 accruedInterestFactor = SCALING_FACTOR + (partialDayCountFractionMantissa * price) / SCALING_FACTOR;
            uint256 expectedValue = offerAndBidAmount * accruedInterestFactor / SCALING_FACTOR;

            (address[] memory accruedManagedAssets, uint256[] memory accruedAssetAmounts) =
                termFinanceLendingPosition.getManagedAssets();

            assertEq(accruedAssetAmounts.length, 1, "Incorrect number of accrued managedAssetAmounts");
            assertEq(accruedManagedAssets, toArray(address(purchaseToken)), "Incorrect accrued managedAsset");

            assertApproxEqRel(
                accruedAssetAmounts[0], expectedValue, bufferPercentInWei, "Incorrect accrued managedAssetValue"
            );
        }

        uint256 redemptionValue = repoToken.redemptionValue() * repoTokenBalance / SCALING_FACTOR;

        // Reimburse the loan. The full repayment is equal to the redemptionValue, as that represents the maturity value of the loan
        vm.prank(bidder);
        termRepoServicer.submitRepurchasePayment({_amount: redemptionValue});

        // Value of the EP should almost equal redemptionValue 1 block before redemptionTime
        {
            vm.warp(termRepoServicer.redemptionTimestamp() - 1);

            (address[] memory accruedManagedAssets, uint256[] memory accruedAssetAmounts) =
                termFinanceLendingPosition.getManagedAssets();

            assertEq(accruedAssetAmounts.length, 1, "Incorrect number of accrued managedAssetAmounts");
            assertEq(accruedManagedAssets, toArray(address(purchaseToken)), "Incorrect accrued managedAsset");

            // Small buffer to account for calc rounding
            assertApproxEqRel(
                accruedAssetAmounts[0], redemptionValue, bufferPercentInWei, "Incorrect accrued managedAssetValue"
            );
        }

        {
            vm.warp(termRepoServicer.redemptionTimestamp() + 1);

            // After redemptionTime, the full value of the repoToken should be priced in
            (address[] memory postRedemptionTimeManagedAssets, uint256[] memory postRedemptionTimeManagedAssetAmounts) =
                termFinanceLendingPosition.getManagedAssets();

            assertEq(
                postRedemptionTimeManagedAssets,
                toArray(address(purchaseToken)),
                "Incorrect post-redemption time managedAsset"
            );
            assertEq(
                postRedemptionTimeManagedAssetAmounts,
                toArray(redemptionValue),
                "Incorrect post-redemption time managedAssetValue"
            );
        }

        uint256 vaultPurchaseTokenBalancePreRedemption = purchaseToken.balanceOf(vaultProxyAddress);
        vm.recordLogs();

        // Redeem partially with a small amount
        uint256 partialRedemptionAmount = 3;
        __redeem({_termFinanceAuction: termFinanceAuction, _amount: partialRedemptionAmount});

        // Assert that the assetsToReceive were formatted correctly
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(purchaseToken))
        });

        uint256 vaultPurchaseTokenBalancePostRedemption = purchaseToken.balanceOf(vaultProxyAddress);

        // Assert that the EP's repoToken balance has decreased
        assertEq(
            IERC20(address(repoToken)).balanceOf(address(termFinanceLendingPosition)),
            repoTokenBalance - partialRedemptionAmount,
            "Incorrect EP balance"
        );

        // Assert that the EP's getManagedAssets have decreased
        (address[] memory postPartialRedemptionManagedAssets, uint256[] memory postPartialRedemptionManagedAssetAmounts)
        = termFinanceLendingPosition.getManagedAssets();

        assertEq(
            postPartialRedemptionManagedAssets,
            toArray(address(purchaseToken)),
            "Incorrect post partial redemption managedAsset"
        );
        assertEq(
            postPartialRedemptionManagedAssetAmounts,
            toArray(redemptionValue - partialRedemptionAmount),
            "Incorrect post partial redemption managedAssetValue"
        );

        // Assert that the vault's purchaseToken balance has increased
        assertEq(
            vaultPurchaseTokenBalancePostRedemption - vaultPurchaseTokenBalancePreRedemption,
            partialRedemptionAmount,
            "Incorrect vault balance"
        );

        uint256 vaultPurchaseTokenBalancePreFullRedemption = purchaseToken.balanceOf(vaultProxyAddress);

        // The TermAuctionRemoved event should be emitted when all term tokens for that auction have been redeemed
        expectEmit(address(termFinanceLendingPosition));
        emit TermAuctionRemoved(address(termFinanceAuction));

        // Redeem the full remaining balance
        __redeem({
            _termFinanceAuction: termFinanceAuction,
            _amount: IERC20(address(repoToken)).balanceOf(address(termFinanceLendingPosition))
        });

        uint256 vaultPurchaseTokenBalancePostFullRedemption = purchaseToken.balanceOf(vaultProxyAddress);

        // Assert that the EP's repoToken balance is 0
        assertEq(IERC20(address(repoToken)).balanceOf(address(termFinanceLendingPosition)), 0, "Incorrect EP balance");

        // Assert that the EP's getManagedAssets is 0
        (address[] memory postRedemptionManagedAssets, uint256[] memory postRedemptionManagedAssetAmounts) =
            termFinanceLendingPosition.getManagedAssets();

        // No value in the EP
        assertEq(postRedemptionManagedAssets.length, 0, "Incorrect number of post redemption managedAssets");
        assertEq(postRedemptionManagedAssetAmounts.length, 0, "Incorrect number of post redemption managedAssetAmounts");

        // Assert that the vault's purchaseToken balance has increased
        assertEq(
            vaultPurchaseTokenBalancePostFullRedemption - vaultPurchaseTokenBalancePreFullRedemption,
            redemptionValue - partialRedemptionAmount,
            "Incorrect vault balance"
        );
    }
}

abstract contract SweepTest is TestBase {
    using AddressArrayLib for address[];

    function test_sweep_successUnexpectedPurchaseToken() public {
        // Add an offer for each termAuction
        for (uint256 i; i < termFinanceAuctions.length; i++) {
            // Warp time to auction start time
            vm.warp(ITermFinanceV1OfferLocker(termFinanceAuctions[i].termAuctionOfferLocker()).auctionStartTime() + 1);

            int256[] memory offerAmounts = new int256[](1);
            offerAmounts[0] = int256(assetUnit(IERC20(purchaseTokens[i])) * 1234);

            // Add an offer
            __addOrUpdateOffers({
                _termFinanceAuction: termFinanceAuctions[i],
                _offerIds: toArray(bytes32("123")),
                _offerPrices: toArray(WEI_ONE_PERCENT),
                _amountsChange: offerAmounts
            });
        }

        // Increase the EP's balance of a purchase Token
        IERC20 purchaseTokenToSweep = IERC20(purchaseTokens[1]);
        uint256 purchaseTokenAmountToSweep = assetUnit(purchaseTokenToSweep) * 55;
        increaseTokenBalance({
            _token: purchaseTokenToSweep,
            _to: address(termFinanceLendingPosition),
            _amount: purchaseTokenAmountToSweep
        });

        uint256 vaultPurchaseTokenBalancePreSweep = purchaseTokenToSweep.balanceOf(vaultProxyAddress);

        address[] memory termAuctionsPreSweep = termFinanceLendingPosition.getTermAuctions();

        vm.recordLogs();

        // Call the sweep action
        __sweep({_termFinanceAuctions: termFinanceAuctions});

        address[] memory termAuctionsPostSweep = termFinanceLendingPosition.getTermAuctions();

        uint256 vaultPurchaseTokenBalancePostSweep = purchaseTokenToSweep.balanceOf(vaultProxyAddress);

        address[] memory uniquePurchaseTokens;

        for (uint256 i; i < purchaseTokens.length; i++) {
            uniquePurchaseTokens = uniquePurchaseTokens.addUniqueItem(purchaseTokens[i]);
        }

        // Assert that the assetsToReceive were formatted correctly
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: uniquePurchaseTokens
        });

        // The purchaseToken should be transfered to the vault
        assertEq(
            vaultPurchaseTokenBalancePostSweep - vaultPurchaseTokenBalancePreSweep,
            purchaseTokenAmountToSweep,
            "Incorrect vault balance"
        );

        // Assert that no termAuctions were removed from storage
        assertEq(termAuctionsPreSweep, termAuctionsPostSweep, "Incorrect term auctions in storage");
    }

    function test_sweep_successAuctionRemoval() public {
        uint256[] memory initialVaultBalances = new uint256[](purchaseTokens.length);
        for (uint256 i; i < purchaseTokens.length; i++) {
            initialVaultBalances[i] = IERC20(purchaseTokens[i]).balanceOf(vaultProxyAddress);
        }

        bytes32 offerIdSeed = bytes32("123");
        bytes32[] memory generatedOfferIds = new bytes32[](purchaseTokens.length);
        int256[] memory offerAmounts = new int256[](purchaseTokens.length);

        // Add an offer for each termAuction
        for (uint256 i; i < termFinanceAuctions.length; i++) {
            offerAmounts[i] = int256(assetUnit(IERC20(termFinanceAuctions[i].purchaseToken())) * 1234);
            int256[] memory amountsChange = new int256[](1);
            amountsChange[0] = offerAmounts[i];
            generatedOfferIds[i] =
                __generateOfferId({_termFinanceAuction: termFinanceAuctions[i], _idSeed: offerIdSeed});

            // Warp time to auction start time
            vm.warp(ITermFinanceV1OfferLocker(termFinanceAuctions[i].termAuctionOfferLocker()).auctionStartTime() + 1);

            // Add an offer
            __addOrUpdateOffers({
                _termFinanceAuction: termFinanceAuctions[i],
                _offerIds: toArray(offerIdSeed),
                _offerPrices: toArray(WEI_ONE_PERCENT),
                _amountsChange: amountsChange
            });
        }

        // Complete the auctions (without revealing the pending offers), refunding all offers
        for (uint256 i; i < termFinanceAuctions.length; i++) {
            ITermFinanceV1Auction termFinanceAuction = termFinanceAuctions[i];

            // Warp the time to after the auctionEndTIme
            vm.warp(termFinanceAuction.auctionEndTime() + 1);

            vm.prank(TERM_FINANCE_ADMIN_ADDRESS);
            // Complete the auction without revealing them, refunding the offers
            termFinanceAuction.completeAuction({
                _completeAuctionInput: ITermFinanceV1Auction.CompleteAuctionInput({
                    revealedBidSubmissions: new bytes32[](0),
                    expiredRolloverBids: new bytes32[](0),
                    unrevealedBidSubmissions: new bytes32[](0),
                    revealedOfferSubmissions: new bytes32[](0),
                    unrevealedOfferSubmissions: toArray(generatedOfferIds[i])
                })
            });
        }

        uint256[] memory offerAmountsUint = new uint256[](offerAmounts.length);
        for (uint256 i; i < offerAmounts.length; i++) {
            offerAmountsUint[i] = uint256(offerAmounts[i]);
        }

        // The offer amounts should now be held by the EP
        (address[] memory assets, uint256[] memory amounts) =
            aggregateAssetAmounts({_rawAssets: purchaseTokens, _rawAmounts: offerAmountsUint, _ceilingAtMax: false});

        for (uint256 i; i < assets.length; i++) {
            assertEq(
                IERC20(assets[i]).balanceOf(address(termFinanceLendingPosition)), amounts[i], "Incorrect EP balance"
            );
        }

        // These amounts should be accounted for by getManagedAssets
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            termFinanceLendingPosition.getManagedAssets();

        assertEq(managedAssets, assets, "Incorrect managedAssets retrieved");
        assertEq(managedAssetAmounts, amounts, "Incorrect managedAssetAmounts retrieved");

        // The TermAuctionRemoved events should be emitted when calling sweep
        for (uint256 i; i < termFinanceAuctions.length; i++) {
            expectEmit(address(termFinanceLendingPosition));
            emit TermAuctionRemoved(address(termFinanceAuctions[i]));
        }

        // Call the sweep action.
        __sweep({_termFinanceAuctions: termFinanceAuctions});

        // Term auctions should be removed from storage (since they have no balance + are past redemption timestamp)
        assertEq(termFinanceLendingPosition.getTermAuctions().length, 0, "Incorrect number of term auctions retrieved");

        // The amounts should now have returned to the vault.
        uint256[] memory postSweepVaultBalances = new uint256[](purchaseTokens.length);
        for (uint256 i; i < purchaseTokens.length; i++) {
            postSweepVaultBalances[i] = IERC20(purchaseTokens[i]).balanceOf(vaultProxyAddress);
        }

        assertEq(postSweepVaultBalances, initialVaultBalances, "Incorrect vault balances");

        // No value should be reported by getManagedAssets
        (address[] memory postSweepManagedAssets, uint256[] memory postSweepManagedAssetAmounts) =
            termFinanceLendingPosition.getManagedAssets();

        assertEq(postSweepManagedAssets.length, 0, "Incorrect number of managedAssets retrieved");
        assertEq(postSweepManagedAssetAmounts.length, 0, "Incorrect number of managedAssetAmounts retrieved");
    }
}

////////////////////
// POSITION VALUE //
////////////////////

abstract contract GetManagedAssetsTest is TestBase {
    function test_getManagedAssets_successNoPosition() public {
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            termFinanceLendingPosition.getManagedAssets();

        assertEq(managedAssets.length, 0, "Incorrect number of managedAssets retrieved");
        assertEq(managedAssetAmounts.length, 0, "Incorrect number of managedAssetAmounts retrieved");
    }
}

abstract contract TermFinanceV1LendingPositionTest is
    AddReplaceAndRemoveOffersTest,
    RedeemTest,
    SweepTest,
    GetManagedAssetsTest
{}

contract TermFinanceV1LendingPositionTestEthereum is TermFinanceV1LendingPositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TIME_SENSITIVE_TERM_FINANCE);
        super.setUp();
    }
}

contract TermFinanceV1LendingPositionTestEthereumV4 is TermFinanceV1LendingPositionTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}
