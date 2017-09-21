pragma solidity ^0.4.11;

import '../dependencies/DBC.sol';
import '../dependencies/ERC20.sol';

/// @title Competition Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Links Melon Funds to Competition
contract Competition is DBC {

    // TYPES

    struct Hopeful { // Someone who wants to succeed or who seems likely to win
        address fund; // Address of the Melon fund
        address manager; // Manager (== owner) of above Melon fund
        bool isCompeting; // Whether currently taking part in a competition
        address depositAsset; // Asset (ERC20 Token) spent to take part in competition
        address payoutAsset; // Asset (usually Melon Token) to be received as prize
        uint depositQuantity; // Quantity of depositAsset spent
        uint payoutQuantity; // Quantity of payoutAsset received as prize
        uint finalSharePrice; // Can be changed for any other comparison metric
    }

    // FIELDS

    // Constant fields
    uint public constant MAX_CONTRIBUTION_DURATION = 4 weeks; // Max amount in seconds of competition
    bytes32 public constant TERMS_AND_CONDITIONS = 0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad; // Hashed terms and conditions as displayed on IPFS.
    // Constructor fields
    address public melonport; // All deposited tokens will be instantly forwarded to this address.
    uint public startTime; // Competition start time in seconds
    uint public endTime; // Competition end time in seconds
    uint public maxDepositQuantity; // Limit amount of deposit to participate in competition
    uint public maxHopefulsNumber; // Limit number of participate in competition
    uint public prizeMoneyAsset; // Equivalent to payoutAsset
    uint public prizeMoneyQuantity; // Total prize money pool
    address public MELON_ASSET; // Adresss of Melon asset contract
    ERC20 public MELON_CONTRACT; // Melon as ERC20 contract

    // Function fields
    Hopeful[] public hopefuls; // List of all hopefuls, can be externally accessed

    // PRE, POST, INVARIANT CONDITIONS

    /// @dev Proofs that terms and conditions have been read and understood
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    /// @return Whether or not terms and conditions have been read and understood
    function termsAndConditionsAreSigned(uint8 v, bytes32 r, bytes32 s) internal returns (bool) {
        return ecrecover(
            // Parity does prepend \x19Ethereum Signed Message:\n{len(message)} before signing.
            //  Signature order has also been changed in 1.6.7 and upcoming 1.7.x,
            //  it will return rsv (same as geth; where v is [27, 28]).
            // Note that if you are using ecrecover, v will be either "00" or "01".
            //  As a result, in order to use this value, you will have to parse it to an
            //  integer and then add 27. This will result in either a 27 or a 28.
            //  https://github.com/ethereum/wiki/wiki/JavaScript-API#web3ethsign
            sha3("\x19Ethereum Signed Message:\n32", TERMS_AND_CONDITIONS),
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
        MELON_CONTRACT = ERC20(MELON_ASSET);
    }


    /// @notice To take part in the competition
    /// @dev Maintainer of above identities mapping (== owner) can trigger this function
    /// @param fund Address of the Melon fund
    /// @param depositAsset Asset (ERC20 Token) spent to take part in competition
    /// @param payoutAsset Asset (usually Melon Token) to be received as prize
    /// @param depositQuantity Quantity of depositAsset spent
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    function registerForCompetition(
        address fund,
        address depositAsset,
        address payoutAsset,
        uint depositQuantity,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(termsAndConditionsAreSigned(v, r, s))
        /* In later version
         * require depositAsset == MELON_ASSET
         * require payoutAsset == MELON_ASSET
         * require depositQuantity <= maxDepositQuantity
         * require hopefuls.length < maxHopefulsNumber
         * require hopefuls.length < maxHopefulsNumber
         */
    {
        hopefuls.push(Hopeful({
          fund: fund,
          manager: msg.sender,
          isCompeting: true,
          depositAsset: depositAsset,
          payoutAsset: payoutAsset,
          depositQuantity: depositQuantity,
          payoutQuantity: 0,
          finalSharePrice: 0
        }));
    }
}
