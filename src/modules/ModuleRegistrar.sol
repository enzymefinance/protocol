pragma solidity ^0.4.8;

import './SimpleCertifier.sol';
import '../dependencies/DBC.sol';

contract ModuleRegistrar is DBC {

    // TYPES

    struct Module { // Information about the module
        string name; // Human-readable name of the Module
        uint moduleClass; // Acts enum-like: assetRegistrar, datafeed, rewards, participation, exchangeAdapter, riskmgmt
        address creator; // Address of Module creator, also address of inflation distribution amount
        string url; // URL for additional information of Module
        bytes32 ipfsHash; // Same as url but for ipfs
        uint sumOfRating; // Sum of comunity based rating of Module
        uint numberOfReviewers; // How many ppl rated this module
        bool exists; // Is this module registered
    }

    // FIELDS

    // Constructor fields
    SimpleCertifier public PICOPS; // Parity KYC verification contract
    // Methods fields
    mapping (string => bool) moduleNameExists; // Maps module names to boolean based on existence
    mapping (address => address) public creatorOperatesModules; // Maps module creator address to module address
    mapping (address => Module) public information; // Maps module address to information about the module
    address[] public registeredModules; // List registered module addresses

    // PRE, POST AND INVARIANT CONDITIONS

    /// @param a Module address to be checked for whether registered or not
    function notRegistered(address a) internal constant returns (bool) { return information[a].exists == false; }
    function isCreator(address a) internal constant returns (bool) { return information[a].creator == msg.sender; }
    /// @dev Whether message sender is KYC verified through PICOPS
    /// @param x Address to be checked for KYC verification
    function isKYCVerified(address x) internal returns (bool) { return PICOPS.certified(x); }

    // CONSTANT METHODS

    // Get registration specific information
    function isRegistered(address ofModule) constant returns (bool) { return !notRegistered(ofModule); }
    function numregisteredModules() constant returns (uint) { return registeredModules.length; }
    function getRegisteredModuleAt(uint id) constant returns (address) { return registeredModules[id]; }

    // NON-CONSTANT METHODS

    function ModuleRegistrar(address ofSimpleCertifier) {
        PICOPS = SimpleCertifier(ofSimpleCertifier);
    }

    // USER INTERFACE

    /// @notice Registers a Module
    /// @dev Only non-registered modules
    /// @param ofModule Address of module to be registered
    /// @param name Human-readable name of the Module
    /// @param moduleClass Enum: assetRegistrar, datafeed, rewards, participation, exchangeAdapter, riskmgmt
    /// @param url URL for additional information of Module
    /// @param ipfsHash Same as url but for ipfs
    function register(
        address ofModule,
        string name,
        uint moduleClass,
        string url,
        bytes32 ipfsHash
    )
        pre_cond(!moduleNameExists[name])
        pre_cond(notRegistered(ofModule))
    {
        registeredModules.push(ofModule);
        information[ofModule] = Module({
            name: name,
            moduleClass: moduleClass,
            creator: msg.sender,
            url: url,
            ipfsHash: ipfsHash,
            sumOfRating: 0,
            numberOfReviewers: 0,
            exists: true
        });
        moduleNameExists[name] = true;
        creatorOperatesModules[msg.sender] = ofModule;
        assert(isRegistered(ofModule));
    }

    /// @notice Updates description information of a registered module
    /// @dev Creator of module can change her existing registered modules
    /// @param ofModule Address of module to be registered
    /// @param name Human-readable name of the Module
    /// @param url URL for additional information of Module
    /// @param ipfsHash Same as url but for ipfs
    function updateDescriptiveInformation(
        address ofModule,
        string name,
        string url,
        bytes32 ipfsHash
    )
        pre_cond(isCreator(ofModule))
        pre_cond(isRegistered(ofModule))
    {
        Module module = information[ofModule];
        module.name = name;
        module.url = url;
        module.ipfsHash = ipfsHash;
    }

    /// @notice Deletes an existing entry
    /// @dev Creator of module can delete her existing registered module
    /// @param ofModule address for which specific information is requested
    function remove(
        address ofModule
    )
        pre_cond(isCreator(ofModule))
        pre_cond(isRegistered(ofModule))
    {
        moduleNameExists[information[ofModule].name] = false;
        delete information[ofModule]; // Sets exists boolean to false
        creatorOperatesModules[msg.sender] = 0;
        assert(notRegistered(ofModule));
    }

    /// @notice Votes on an existing registered module
    /// @dev Only KYC registered users can vote on registered modules w rating betw 0 and 10
    /// @param ofModule address for which specific information is requested
    /// @param rating uint between 0 and 10; 0 being worst, 10 being best
    function vote(address ofModule, uint rating) public
        pre_cond(isRegistered(ofModule))
        pre_cond(isKYCVerified(msg.sender))
        pre_cond(rating <= 10)
    {
        information[ofModule].sumOfRating += rating;
        information[ofModule].numberOfReviewers += 1;
    }
}
