pragma solidity ^0.4.19;

import 'ds-test/test.sol';
import './ModuleRegistrar.sol';
import './SimpleCertifier.sol';


contract ModuleRegistrarTest is DSTest {

    SimpleCertifier certifier;
    ModuleRegistrar registrar;
    Caller caller;

    // hoisted variables
    address inputAddress = 0xE01c10Fd900939D1EaB56eE373Ea5E2BD4E2cfB3;
    string inputName = 'My module';
    uint inputClass = 11;
    string inputUrl = 'modul.ar';
    string inputIpfs = 'ipfs';

    function setUp() {
        certifier = new SimpleCertifier();
        registrar = new ModuleRegistrar(certifier);
        caller = new Caller(registrar);
    }

    function test_registerWithoutCertification() {
        assert(!certifier.certified(caller));

        caller.register(
            inputAddress, inputName, inputClass, inputUrl, inputIpfs
        );

        assertEq(registrar.creatorOperatesModules(caller), inputAddress);
        assertEq(registrar.getRegisteredModuleAt(0), inputAddress);
        assert(registrar.moduleNameExists(keccak256(inputName)));
    }

    function test_registrationInformationAccurate() {
        caller.register(
            inputAddress, inputName, inputClass, inputUrl, inputIpfs
        );

        var (
            moduleName,
            moduleClass,
            moduleCreator,
            moduleUrl,
            moduleIpfs,
            moduleRating,
            moduleReviewers,
            moduleExists
        ) = registrar.information(inputAddress);
        assertEq(moduleClass, inputClass);
        assertEq(moduleCreator, caller);
        // below lines give compiler error
        // assertEq(bytes32(keccak256(moduleName)), bytes32(keccak256(inputName)));
        // assertEq(bytes32(keccak256(moduleUrl)), bytes32(keccak256(inputUrl)));
        // assertEq(moduleIpfs, inputIpfs);
        assertEq(moduleRating, 0);
        assertEq(moduleReviewers, 0);
        assert(moduleExists);
    }

    function test_removeFromRegistry() {
        caller.register(
            inputAddress, inputName, inputClass, inputUrl, inputIpfs
        );
        caller.remove(inputAddress);
        var( , , , , , , , exists) = registrar.information(inputAddress);

        assert(!exists);
        assert(!registrar.moduleNameExists(keccak256(inputName)));
        assertEq(registrar.creatorOperatesModules(caller), 0x0);
    }

    function test_votingWhenCertified() {
        caller.register(
            inputAddress, inputName, inputClass, inputUrl, inputIpfs
        );
        certifier.certify(caller);
        caller.vote(inputAddress, 5);
        var( , , , , , sumRatings, numVoters, ) = registrar.information(inputAddress);

        assertEq(sumRatings, 5);
        assertEq(numVoters, 1);

        Caller friend = new Caller(registrar);
        certifier.certify(friend);
        friend.vote(inputAddress, 10);
        var( , , , , , newSumRatings, newNumVoters, ) = registrar.information(inputAddress);

        assertEq(newSumRatings, 15);
        assertEq(newNumVoters, 2);
    }

    function testFail_voterNotCertified() {
        caller.register(
            inputAddress, inputName, inputClass, inputUrl, inputIpfs
        );
        caller.vote(inputAddress, 10);
    }

    function testFail_doubleVoting() {
        caller.register(
            inputAddress, inputName, inputClass, inputUrl, inputIpfs
        );
        certifier.certify(caller);
        caller.vote(inputAddress, 5);
        caller.vote(inputAddress, 3);
    }
}

contract Caller {
    ModuleRegistrar registrar;

    function Caller(ModuleRegistrar _registrar) {
        registrar = _registrar;
    }

    function register(address ofModule, string name, uint moduleClass, string url, string ipfsHash) {
        registrar.register(ofModule, name, moduleClass, url, ipfsHash);
    }

    function remove(address ofModule) {
        registrar.remove(ofModule);
    }

    function vote(address ofModule, uint rating) {
        registrar.vote(ofModule, rating);
    }
}
