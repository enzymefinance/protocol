pragma solidity ^0.4.19;

import "./CompetitionInterface.sol";
import "../assets/ERC20Interface.sol";
import '../assets/AssetInterface.sol';
import '../FundInterface.sol';
import '../version/Version.sol';
import '../pricefeeds/CanonicalPriceFeed.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import "ds-math/math.sol";

/// @title Competition Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Register Melon funds in competition
contract Competition is CompetitionInterface, DSMath, DBC, Owned {

    // TYPES

    struct Registrant {
        address fund; // Address of the Melon fund
        address registrant; // Manager and registrant of the fund
        bool hasSigned; // Whether initial requirements passed and Registrant signed Terms and Conditions;
        uint buyinQuantity; // Quantity of buyinAsset spent
        uint payoutQuantity; // Quantity of payoutAsset received as prize
        bool isRewarded; // Is the Registrant rewarded yet
    }

    struct RegistrantId {
      uint id; // Actual Registrant Id
      bool exists; // Used to check if the mapping exists
    }

    // FIELDS

    // Constant fields
    // Competition terms and conditions as displayed on https://ipfs.io/ipfs/QmXuUfPi6xeYfuMwpVAughm7GjGUjkbEojhNR8DJqVBBxc
    // IPFS hash encoded using http://lenschulwitz.com/base58
    bytes public constant TERMS_AND_CONDITIONS = hex"12208E21FD34B8B2409972D30326D840C9D747438A118580D6BA8C0735ED53810491";
    uint public MELON_BASE_UNIT = 10 ** 18;
    // Constructor fields
    address public custodian; // Address of the custodian which holds the funds sent
    uint public startTime; // Competition start time in seconds (Temporarily Set)
    uint public endTime; // Competition end time in seconds
    uint public payoutRate; // Fixed MLN - Ether conversion rate
    uint public bonusRate; // Bonus multiplier
    uint public totalMaxBuyin; // Limit amount of deposit to participate in competition (Valued in Ether)
    uint public currentTotalBuyin; // Total buyin till now
    uint public maxRegistrants; // Limit number of participate in competition
    uint public prizeMoneyAsset; // Equivalent to payoutAsset
    uint public prizeMoneyQuantity; // Total prize money pool
    address public MELON_ASSET; // Adresss of Melon asset contract
    ERC20Interface public MELON_CONTRACT; // Melon as ERC20 contract
    address public CHF_ASSET; // Adresss of CHF asset based on the Canonical Registrar
    address public COMPETITION_VERSION; // Version contract address
    // Methods fields
    Registrant[] public registrants; // List of all registrants, can be externally accessed
    mapping (address => address) public registeredFundToRegistrants; // For fund address indexed accessing of registrant addresses
    mapping(address => RegistrantId) public registrantToRegistrantIds; // For registrant address indexed accessing of registrant ids
    mapping(address => uint) public whitelistantToMaxBuyin; // For registrant address to respective max buyIn cap (Valued in CHF)

    //EVENTS

    event Register(uint withId, address fund, address manager);

    // PRE, POST, INVARIANT CONDITIONS

    /// @dev Proofs that terms and conditions have been read and understood
    /// @param byManager Address of the fund manager, as used in the ipfs-frontend
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    /// @return Whether or not terms and conditions have been read and understood
    function termsAndConditionsAreSigned(address byManager, uint8 v, bytes32 r, bytes32 s) view returns (bool) {
        return ecrecover(
            // Parity does prepend \x19Ethereum Signed Message:\n{len(message)} before signing.
            //  Signature order has also been changed in 1.6.7 and upcoming 1.7.x,
            //  it will return rsv (same as geth; where v is [27, 28]).
            // Note that if you are using ecrecover, v will be either "00" or "01".
            //  As a result, in order to use this value, you will have to parse it to an
            //  integer and then add 27. This will result in either a 27 or a 28.
            //  https://github.com/ethereum/wiki/wiki/JavaScript-API#web3ethsign
            keccak256("\x19Ethereum Signed Message:\n34", TERMS_AND_CONDITIONS),
            v,
            r,
            s
        ) == byManager; // Has sender signed TERMS_AND_CONDITIONS
    }

    /// @dev Whether message sender is KYC verified through CERTIFIER
    /// @param x Address to be checked for KYC verification
    function isWhitelisted(address x) view returns (bool) { return whitelistantToMaxBuyin[x] > 0; }

    /// @dev Whether the competition is on-going
    function isCompetitionActive() view returns (bool) { return now >= startTime && now < endTime; }

    // CONSTANT METHODS

    function getMelonAsset() view returns (address) { return MELON_ASSET; }

    /// @return Get RegistrantId from registrant address
    function getRegistrantId(address x) view returns (uint) { return registrantToRegistrantIds[x].id; }

    /// @return Address of the fund registered by the registrant address
    function getRegistrantFund(address x) view returns (address) { return registrants[getRegistrantId(x)].fund; }

    /// @return Get time to end of the competition
    function getTimeTillEnd() view returns (uint) { return sub(endTime, now); }

    /// @return Get value of the ether quantity in CHF
    function getCHFValue(uint payin) view returns (uint) {
        address feedAddress = Version(COMPETITION_VERSION).CANONICAL_PRICEFEED();
        var (isRecent, price, ) = CanonicalPriceFeed(feedAddress).getInvertedPriceInfo(CHF_ASSET);
        if (!isRecent) {
            revert();
        }
        return mul(price, payin) / (10 ** 18);
    }

    /// @return Get value of MLN amount in Ether
    function getEtherValue(uint amount) view returns (uint) {
        address feedAddress = Version(COMPETITION_VERSION).CANONICAL_PRICEFEED();
        var (isRecent, price, ) = CanonicalPriceFeed(feedAddress).getPriceInfo(MELON_ASSET);
        if (!isRecent) {
            revert();
        }
        return mul(price, amount) / 10 ** 18;
    }

    /// @return Calculated payout in MLN with bonus for payin in Ether
    function calculatePayout(uint payin) view returns (uint payoutQuantity) {
        payoutQuantity = mul(payin, payoutRate) / 10 ** 18;
    }

    /**
    @notice Returns an array of fund addresses and an associated array of whether competing and whether disqualified
    @return {
      "fundAddrs": "Array of addresses of Melon Funds",
      "fundRegistrants": "Array of addresses of Melon fund managers, as used in the ipfs-frontend",
    }
    */
    function getCompetitionStatusOfRegistrants()
        view
        returns(
            address[],
            address[],
            bool[]
        )
    {
        address[] memory fundAddrs = new address[](registrants.length);
        address[] memory fundRegistrants = new address[](registrants.length);
        bool[] memory isRewarded = new bool[](registrants.length);

        for (uint i = 0; i < registrants.length; i++) {
            fundAddrs[i] = registrants[i].fund;
            fundRegistrants[i] = registrants[i].registrant;
            isRewarded[i] = registrants[i].isRewarded;
        }
        return (fundAddrs, fundRegistrants, isRewarded);
    }

    // NON-CONSTANT METHODS

    function Competition(
        address ofMelonAsset,
        address ofCHFAsset,
        address ofCompetitionVersion,
        address ofCustodian,
        uint ofStartTime,
        uint ofEndTime,
        uint ofPayoutRate,
        uint ofTotalMaxBuyin,
        uint ofMaxRegistrants
    ) {
        MELON_ASSET = ofMelonAsset;
        MELON_CONTRACT = ERC20Interface(MELON_ASSET);
        CHF_ASSET = ofCHFAsset;
        COMPETITION_VERSION = ofCompetitionVersion;
        custodian = ofCustodian;
        startTime = ofStartTime;
        endTime = ofEndTime;
        payoutRate = ofPayoutRate;
        totalMaxBuyin = ofTotalMaxBuyin;
        maxRegistrants = ofMaxRegistrants;
    }

    /// @notice Register to take part in the competition
    /// @dev Check if the fund address is actually from the Competition Version
    /// @param fund Address of the Melon fund
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    function registerForCompetition(
        address fund,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        payable
        pre_cond(isCompetitionActive() && !Version(COMPETITION_VERSION).isShutDown())
        pre_cond(termsAndConditionsAreSigned(msg.sender, v, r, s) && isWhitelisted(msg.sender))
    {
        require(registeredFundToRegistrants[fund] == address(0) && registrantToRegistrantIds[msg.sender].exists == false);
        require(add(currentTotalBuyin, msg.value) <= totalMaxBuyin && registrants.length < maxRegistrants);
        require(getCHFValue(msg.value) <= whitelistantToMaxBuyin[msg.sender]);
        require(Version(COMPETITION_VERSION).getFundByManager(msg.sender) == fund);

        // Calculate Payout Quantity, invest the quantity in registrant's fund
        uint payoutQuantity = calculatePayout(msg.value);
        registeredFundToRegistrants[fund] = msg.sender;
        registrantToRegistrantIds[msg.sender] = RegistrantId({id: registrants.length, exists: true});
        currentTotalBuyin = add(currentTotalBuyin, msg.value);
        FundInterface fundContract = FundInterface(fund);
        MELON_CONTRACT.approve(fund, payoutQuantity);

        // Give payoutRequest MLN in return for msg.value
        fundContract.requestInvestment(payoutQuantity, getEtherValue(payoutQuantity), MELON_ASSET);
        fundContract.executeRequest(fundContract.getLastRequestId());
        custodian.transfer(msg.value);

        // Emit Register event
        emit Register(registrants.length, fund, msg.sender);

        registrants.push(Registrant({
          fund: fund,
          registrant: msg.sender,
          hasSigned: true,
          buyinQuantity: msg.value,
          payoutQuantity: payoutQuantity,
          isRewarded: false
        }));
    }

    /// @notice Add batch addresses to whitelist with set maxBuyinQuantity
    /// @dev Only the owner can call this function
    /// @param maxBuyinQuantity Quantity of payoutAsset received as prize
    /// @param whitelistants Performance of Melon fund at competition endTime; Can be changed for any other comparison metric
    function batchAddToWhitelist(
        uint maxBuyinQuantity,
        address[] whitelistants
    )
        pre_cond(isOwner())
        pre_cond(now < endTime)
    {
        for (uint i = 0; i < whitelistants.length; ++i) {
            whitelistantToMaxBuyin[whitelistants[i]] = maxBuyinQuantity;
        }
    }

    /// @notice Claim Reward
    function claimReward()
        pre_cond(getRegistrantFund(msg.sender) != address(0))
        pre_cond(now >= endTime || Version(COMPETITION_VERSION).isShutDown())
    {
        Registrant registrant  = registrants[getRegistrantId(msg.sender)];
        require(registrant.isRewarded == false);
        registrant.isRewarded = true;
        // Is this safe to assume this or should we transfer all the balance instead?
        uint balance = AssetInterface(registrant.fund).balanceOf(this);
        assert(AssetInterface(registrant.fund).transfer(registrant.registrant, balance));

        // Emit ClaimedReward event
        emit ClaimReward(msg.sender, registrant.fund, balance);
    }
}
