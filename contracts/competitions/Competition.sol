pragma solidity ^0.4.11;

import '../FundInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Competition Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Links Melon Funds to Competition Ids
contract Competition is DBC, Owned {

    // TYPES

    struct Participant {
        address fund;
        address manager;
        bool isCompeting;
        address depositAsset;
        address payoutAsset;
        uint depositQuantity;
        uint payoutQuantity;
    }

    // FIELDS

    // Constructor fields
    address public MELON_ASSET; // Adresss of Melon asset contract
    // TODO needs to be defined
    string public TERMS_AND_CONDITIONS; // This is the legal text as displayed on IPFS.
    // Function fields
    mapping (bytes32 => Participant[]) participants; // links competitionHashes to array of participants

    // PRE, POST, INVARIANT CONDITIONS

    function termsAndConditionsAreSigned(uint8 v, bytes32 r, bytes32 s) internal returns (bool) {
        bytes32 hash = sha3(TERMS_AND_CONDITIONS); // Convert string into bytes32
        return ecrecover(
            // Parity does prepend \x19Ethereum Signed Message:\n{len(message)} before signing.
            // Signature order has also been changed in 1.6.7 and upcoming 1.7.x,
            // it will return rsv (same as geth; where v is [27, 28]).
            keccak256("\x19Ethereum Signed Message:\n32", hash),
            v,
            r,
            s
        ) == msg.sender; // Has sender signed TERMS_AND_CONDITIONS
    }

    // CONSTANT METHODS

    function getMelonAsset() constant returns (address) { return MELON_ASSET; }

    // NON-CONSTANT METHODS

    function Competition(
        address ofMelonAsset
    ) {
        MELON_ASSET = ofMelonAsset;
    }

    function registerForCompetition(
        bytes32 competitionHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(termsAndConditionsAreSigned(v, r, s)) // TODO throws out of gas error
    {
        
    }

}
