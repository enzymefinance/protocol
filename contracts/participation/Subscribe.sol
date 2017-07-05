pragma solidity ^0.4.11;

import "./SubscribeProtocol.sol";
import "../assets/AssetProtocol.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../dependencies/SafeMath.sol";
import "../assets/EtherToken.sol";
import "../VaultProtocol.sol";


/// @title Subscribe Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Subscribe Module.
contract Subscribe is SubscribeProtocol, DBC, SafeMath, Owned {

    // FIELDS

    // EVENTS

    event SharesCreated(address indexed byParticipant, uint atTimestamp, uint numShares);

    // PRE, POST, INVARIANT CONDITIONS

    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isAtLeast(uint x, uint y) internal returns (bool) { return x >= y; }

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function Subscribe() {}

    /// Pre: Investor pre-approves spending of vault's reference asset to this contract
    /// Post: Subscribe in a fund by creating shares
    /* Rem:
     *  This can be seen as a non-persistent all or nothing limit order, where:
     *  amount == wantedShares and price == wantedShares/offeredAmount [Shares / Reference Asset]
     */
    function createSharesWithReferenceAsset(address ofVault, uint wantedShares, uint offeredValue)
        pre_cond(isPastZero(wantedShares))
    {
        VaultProtocol vault = VaultProtocol(ofVault);
        AssetProtocol refAsset = AssetProtocol(vault.getReferenceAsset());
        // get price of the shares we want in baseUnits of reftoken
        uint actualValue = vault.getRefPriceForNumShares(wantedShares);
        // transfer requried amount [ref] from investor to this contract
        // Note: Security risk for Investor - no guarantee that slice gets actually alocated
        assert(refAsset.transferFrom(msg.sender, owner, actualValue)); // send funds from investor to owner contract
        //TODO better to approve externally
        if(isPastZero(vault.totalSupply())){  // we need to approve slice in proportion to Vault allocation
            var (assetList, amountList, numAssets) = vault.getSliceForNumShares(wantedShares);
            for (uint i = 0; i < numAssets; i++) {
                if(!isPastZero(amountList[i]))
                    continue;
                AssetProtocol thisAsset = AssetProtocol(assetList[i]);
                assert(thisAsset.approve(ofVault, amountList[i]));
            }
        } else { // we will just buy the shares with reference asset
            //TODO: check recipient
            refAsset.approve(ofVault, actualValue);
        }
        vault.createSharesOnBehalf(msg.sender, wantedShares);
        SharesCreated(msg.sender, now, wantedShares);
    }
}
