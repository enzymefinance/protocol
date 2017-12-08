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
        uint numberOfVoters; // How many ppl rated this module
        bool exists; // Is this module registered
    }

    // FIELDS

    // Constructor fields
    SimpleCertifier public PICOPS; // Parity KYC verification contract
    // Methods fields
    mapping (bytes32 => bool) public moduleNameExists; // Maps module names to boolean based on existence
    mapping (address => address) public creatorOperatesModules; // Maps module creator address to module address
    mapping (address => Module) public information; // Maps module address to information about the module
    mapping (address => bool) public hasVoted;
    address[] public registeredModules; // List registered module addresses

    // VIEW METHODS

    // Get registration specific information
    function numRegisteredModules() constant returns (uint) { return registeredModules.length; }
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
        pre_cond(!moduleNameExists[keccak256(name)])
        pre_cond(!information[ofModule].exists)
    {
        registeredModules.push(ofModule);
        information[ofModule] = Module({
            name: name,
            moduleClass: moduleClass,
            creator: msg.sender,
            url: url,
            ipfsHash: ipfsHash,
            sumOfRating: 0,
            numberOfVoters: 0,
            exists: true
        });
        moduleNameExists[keccak256(name)] = true;
        creatorOperatesModules[msg.sender] = ofModule;
        assert(information[ofModule].exists);
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
        pre_cond(information[ofModule].creator == msg.sender)
        pre_cond(information[ofModule].exists)
    {
        Module module = information[ofModule];
        module.name = name;
        moduleNameExists[keccak256(module.name)] = false;
        moduleNameExists[keccak256(name)] = true;
        module.url = url;
        module.ipfsHash = ipfsHash;
    }

    /// @notice Deletes an existing entry
    /// @dev Creator of module can delete her existing registered module
    /// @param ofModule address for which specific information is requested
    function remove(
        address ofModule
    )
        pre_cond(information[ofModule].creator == msg.sender)
        pre_cond(information[ofModule].exists)
    {
        moduleNameExists[keccak256(information[ofModule].name)] = false;
        delete information[ofModule]; // Sets exists boolean to false
        creatorOperatesModules[msg.sender] = 0;
        assert(!information[ofModule].exists);
    }

    /// @notice Votes on an existing registered module
    /// @dev Only KYC registered users can vote on registered modules w rating betw 0 and 10
    /// @param ofModule address for which specific information is requested
    /// @param rating uint between 0 and 10; 0 being worst, 10 being best
    function vote(address ofModule, uint rating) public
        pre_cond(information[ofModule].exists)
        pre_cond(PICOPS.certified(msg.sender))
        pre_cond(!hasVoted[msg.sender])
        pre_cond(rating <= 10)
    {
        hasVoted[msg.sender] = true;
        information[ofModule].sumOfRating += rating;
        information[ofModule].numberOfVoters += 1;
    }
}
