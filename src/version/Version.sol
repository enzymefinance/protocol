pragma solidity ^0.4.19;

import "../Fund.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "./VersionInterface.sol";

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned, VersionInterface {
    // FIELDS

    // Constant fields
    bytes32 public constant TERMS_AND_CONDITIONS = 0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad; // Hashed terms and conditions as displayed on IPFS.
    // Constructor fields
    string public VERSION_NUMBER; // SemVer of Melon protocol version
    address public NATIVE_ASSET; // Address of wrapped native asset contract
    address public GOVERNANCE; // Address of Melon protocol governance contract
    // Methods fields
    bool public isShutDown; // Governance feature, if yes than setupFund gets blocked and shutDownFund gets opened
    address[] public listOfFunds; // A complete list of fund addresses created using this version
    mapping (address => address) public managerToFunds; // Links manager address to fund address created using this version
    mapping (bytes32 => address) public fundNamesToOwners; // Links fund names to address based on ownership

    // EVENTS

    event FundUpdated(address ofFund);

    // METHODS

    // CONSTRUCTOR

    /// @param versionNumber SemVer of Melon protocol version
    /// @param ofGovernance Address of Melon governance contract
    /// @param ofNativeAsset Address of wrapped native asset contract
    function Version(
        string versionNumber,
        address ofGovernance,
        address ofNativeAsset
    ) {
        VERSION_NUMBER = versionNumber;
        GOVERNANCE = ofGovernance;
        NATIVE_ASSET = ofNativeAsset;
    }

    // EXTERNAL METHODS

    function shutDown() external pre_cond(msg.sender == GOVERNANCE) { isShutDown = true; }

    // PUBLIC METHODS

    /// @param ofFundName human-readable descriptive name (not necessarily unique)
    /// @param ofQuoteAsset Asset against which performance reward is measured against
    /// @param ofManagementRewardRate A time based reward, given in a number which is divided by 10 ** 15
    /// @param ofPerformanceRewardRate A time performance based reward, performance relative to ofQuoteAsset, given in a number which is divided by 10 ** 15
    /// @param ofCompliance Address of participation module
    /// @param ofRiskMgmt Address of risk management module
    /// @param ofPriceFeed Address of price feed module
    /// @param ofExchanges Addresses of exchange on which this fund can trade
    /// @param ofExchangeAdapters Addresses of exchange adapters
    /// @param v ellipitc curve parameter v
    /// @param r ellipitc curve parameter r
    /// @param s ellipitc curve parameter s
    function setupFund(
        string ofFundName,
        address ofQuoteAsset,
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofCompliance,
        address ofRiskMgmt,
        address ofPriceFeed,
        address[] ofExchanges,
        address[] ofExchangeAdapters,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(!isShutDown);
        require(termsAndConditionsAreSigned(v, r, s));
        // Either novel fund name or previous owner of fund name
        require(fundNamesToOwners[keccak256(ofFundName)] == 0 || fundNamesToOwners[keccak256(ofFundName)] == msg.sender);
        require(managerToFunds[msg.sender] == 0); // Add limitation for simpler migration process of shutting down and setting up fund
        address ofFund = new Fund(
            msg.sender,
            ofFundName,
            ofQuoteAsset,
            ofManagementRewardRate,
            ofPerformanceRewardRate,
            NATIVE_ASSET,
            ofCompliance,
            ofRiskMgmt,
            ofPriceFeed,
            ofExchanges,
            ofExchangeAdapters
        );
        listOfFunds.push(ofFund);
        fundNamesToOwners[keccak256(ofFundName)] = msg.sender;
        managerToFunds[msg.sender] = ofFund;
        FundUpdated(ofFund);
    }

    /// @dev Dereference Fund and trigger selfdestruct
    /// @param ofFund Address of the fund to be shut down
    function shutDownFund(address ofFund)
        pre_cond(isShutDown || managerToFunds[msg.sender] == ofFund)
    {
        Fund fund = Fund(ofFund);
        delete managerToFunds[msg.sender];
        delete fundNamesToOwners[fund.getNameHash()];
        fund.shutDown();
        FundUpdated(ofFund);
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
    function fundNameTaken(string ofFundName) view returns (bool) { return fundNamesToOwners[keccak256(ofFundName)] != 0; }
}
