pragma solidity ^0.4.8;

import './SimpleCertifier.sol';
import '../dependencies/DBC.sol';

contract ModuleRegistrar is DBC {

    // TYPES

    struct Module {
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
    mapping (string => bool) moduleNameExists; // Links module names to boolean based on existence
    mapping (address => address) public creatorOperatesModules; // Links module creator addresses to boolean based on current operation
    mapping (address => Module) public information;
    address[] public registeredModules;

    // PRE, POST AND INVARIANT CONDITIONS

    function notRegistered(address a) internal constant returns (bool) { return information[a].exists == false; }
    function isCreator(address a) internal constant returns (bool) { return information[a].creator == msg.sender; }
    function isUniqueName(address a) internal constant returns (bool) { return information[a].creator == msg.sender; }
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

    /// @notice Registers a Module residing in a chain
    /// @dev Pre: Only non-registered modules
    /// @dev Post: Address ofModule is registered
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
        post_cond(isRegistered(ofModule))
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
    }

    /// @notice Updates description information of a registered module
    /// @dev Owner can change an existing entry for registered modules
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
    /// @dev Owner can delete an existing entry
    /// @param ofModule address for which specific information is requested
    function remove(
        address ofModule
    )
        pre_cond(isCreator(ofModule))
        pre_cond(isRegistered(ofModule))
        post_cond(notRegistered(ofModule))
    {
        moduleNameExists[information[ofModule].name] = false;
        delete information[ofModule]; // Sets exists boolean to false
        creatorOperatesModules[msg.sender] = 0;
    }

    function vote(address ofModule, uint rating) public
        pre_cond(isRegistered(ofModule))
        pre_cond(isCreator(ofModule))
        pre_cond(isKYCVerified(msg.sender))
    {
        if (rating <= 10) {
            information[ofModule].sumOfRating += rating;
            information[ofModule].numberOfReviewers += 1;
        }
    }
}
