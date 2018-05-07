pragma solidity ^0.4.21;

import "../Fund.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../compliance/CompetitionCompliance.sol";
import "./VersionInterface.sol";

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned, VersionInterface {
    // FIELDS

    bytes32 public constant TERMS_AND_CONDITIONS = 0xAA9C907B0D6B4890E7225C09CBC16A01CB97288840201AA7CDCB27F4ED7BF159; // Hashed terms and conditions as displayed on IPFS, decoded from base 58

    // Constructor fields
    string public VERSION_NUMBER; // SemVer of Melon protocol version
    address public MELON_ASSET; // Address of Melon asset contract
    address public NATIVE_ASSET; // Address of Fixed quote asset
    address public GOVERNANCE; // Address of Melon protocol governance contract
    address public CANONICAL_PRICEFEED; // Address of the canonical pricefeed

    // Methods fields
    bool public isShutDown; // Governance feature, if yes than setupFund gets blocked and shutDownFund gets opened
    address public COMPLIANCE; // restrict to Competition compliance module for this version
    address[] public listOfFunds; // A complete list of fund addresses created using this version
    mapping (address => address) public managerToFunds; // Links manager address to fund address created using this version

    // EVENTS

    event FundUpdated(address ofFund);

    // METHODS

    // CONSTRUCTOR

    /// @param versionNumber SemVer of Melon protocol version
    /// @param ofGovernance Address of Melon governance contract
    /// @param ofMelonAsset Address of Melon asset contract
    function Version(
        string versionNumber,
        address ofGovernance,
        address ofMelonAsset,
        address ofNativeAsset,
        address ofCanonicalPriceFeed,
        address ofCompetitionCompliance
    ) {
        VERSION_NUMBER = versionNumber;
        GOVERNANCE = ofGovernance;
        MELON_ASSET = ofMelonAsset;
        NATIVE_ASSET = ofNativeAsset;
        CANONICAL_PRICEFEED = ofCanonicalPriceFeed;
        COMPLIANCE = ofCompetitionCompliance;
    }

    // EXTERNAL METHODS

    function shutDown() external pre_cond(msg.sender == GOVERNANCE) { isShutDown = true; }

    // PUBLIC METHODS

    /// @param ofFundName human-readable descriptive name (not necessarily unique)
    /// @param ofQuoteAsset Asset against which performance fee is measured against
    /// @param ofManagementFee A time based fee, given in a number which is divided by 10 ** 15
    /// @param ofPerformanceFee A time performance based fee, performance relative to ofQuoteAsset, given in a number which is divided by 10 ** 15
    /// @param ofCompliance Address of participation module
    /// @param ofRiskMgmt Address of risk management module
    /// @param ofExchanges Addresses of exchange on which this fund can trade
    /// @param ofDefaultAssets Enable invest/redeem with these assets (quote asset already enabled)
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    function setupFund(
        bytes32 ofFundName,
        address ofQuoteAsset,
        uint ofManagementFee,
        uint ofPerformanceFee,
        address ofCompliance,
        address ofRiskMgmt,
        address[] ofExchanges,
        address[] ofDefaultAssets,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(!isShutDown);
        require(termsAndConditionsAreSigned(v, r, s));
        require(CompetitionCompliance(COMPLIANCE).isCompetitionAllowed(msg.sender));
        require(managerToFunds[msg.sender] == 0); // Add limitation for simpler migration process of shutting down and setting up fund
        address[] memory melonAsDefaultAsset = new address[](1);
        melonAsDefaultAsset[0] = MELON_ASSET; // Melon asset should be in default assets
        address ofFund = new Fund(
            msg.sender,
            ofFundName,
            NATIVE_ASSET,
            0,
            0,
            COMPLIANCE,
            ofRiskMgmt,
            CANONICAL_PRICEFEED,
            ofExchanges,
            melonAsDefaultAsset
        );
        listOfFunds.push(ofFund);
        managerToFunds[msg.sender] = ofFund;
        emit FundUpdated(ofFund);
    }

    /// @dev Dereference Fund and shut it down
    /// @param ofFund Address of the fund to be shut down
    function shutDownFund(address ofFund)
        pre_cond(isShutDown || managerToFunds[msg.sender] == ofFund)
    {
        Fund fund = Fund(ofFund);
        delete managerToFunds[msg.sender];
        fund.shutDown();
        emit FundUpdated(ofFund);
    }

    // PUBLIC VIEW METHODS

    /// @dev Proof that terms and conditions have been read and understood
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    /// @return signed Whether or not terms and conditions have been read and understood
    function termsAndConditionsAreSigned(uint8 v, bytes32 r, bytes32 s) view returns (bool signed) {
        return ecrecover(
            // Parity does prepend \x19Ethereum Signed Message:\n{len(message)} before signing.
            //  Signature order has also been changed in 1.6.7 and upcoming 1.7.x,
            //  it will return rsv (same as geth; where v is [27, 28]).
            // Note that if you are using ecrecover, v will be either "00" or "01".
            //  As a result, in order to use this value, you will have to parse it to an
            //  integer and then add 27. This will result in either a 27 or a 28.
            //  https://github.com/ethereum/wiki/wiki/JavaScript-API#web3ethsign
            keccak256("\x19Ethereum Signed Message:\n32", TERMS_AND_CONDITIONS),
            v,
            r,
            s
        ) == msg.sender; // Has sender signed TERMS_AND_CONDITIONS
    }

    function getNativeAsset() view returns (address) { return NATIVE_ASSET; }
    function getFundById(uint withId) view returns (address) { return listOfFunds[withId]; }
    function getLastFundId() view returns (uint) { return listOfFunds.length - 1; }
    function getFundByManager(address ofManager) view returns (address) { return managerToFunds[ofManager]; }
}
