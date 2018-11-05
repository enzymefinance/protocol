"use strict";
exports.__esModule = true;
var fs = require("fs");
var path = require("path");
var glob = require("glob");
var solc = require("solc");
var mkdirp = require("mkdirp");
var R = require("ramda");
var rimraf = require("rimraf");
var soliditySourceDirectory = path.join(__dirname, '..', 'src', 'contracts');
var solidityCompileTarget = path.join(__dirname, '..', 'out');
var debug = require('debug')["default"]('melon:protocol:bin');
var findImports = function (missingPath, b, c) {
    var query = path.join(soliditySourceDirectory, '**', missingPath);
    var candidates = glob.sync(query);
    if (candidates.length > 1) {
        throw new Error("Multiple source files named " + missingPath + " found. " + candidates);
    }
    if (candidates.length === 0) {
        throw new Error("Can not find import named: " + missingPath);
    }
    debug('Resolved import', missingPath, candidates[0]);
    var contents = fs.readFileSync(candidates[0], { encoding: 'utf-8' });
    return {
        contents: contents
    };
};
// Not used at the moment
// TODO: Fix this and make it work
var compile = function (pathToSol) {
    var _a;
    debug('Compiling ...', pathToSol);
    var parsed = path.parse(pathToSol);
    var source = fs.readFileSync(pathToSol, { encoding: 'utf-8' });
    var input = {
        sources: (_a = {},
            _a[parsed.base] = source,
            _a)
    };
    var output = solc.compile(input, 1, findImports);
    debug('Compiled', pathToSol);
    if (output.errors)
        output.errors.forEach(debug);
    var targetDir = path.join(solidityCompileTarget, parsed.dir);
    var targetPath = path.join(targetDir, parsed.name + ".json");
    debug('Writing to', targetPath);
    mkdirp.sync(targetDir);
    fs.writeFileSync(targetPath, JSON.stringify(output, null, 2));
    return output;
};
var writeFiles = function (compileOutput, contract) {
    var _a = contract.split(':'), sourceName = _a[0], contractName = _a[1];
    var parsedPath = path.parse(sourceName);
    var targetDir = path.join(solidityCompileTarget, parsedPath.dir);
    var targetBasePath = path.join(targetDir, contractName);
    debug('Writing', contract);
    mkdirp.sync(targetDir);
    if (fs.existsSync(targetBasePath + ".abi")) {
        throw new Error(
        // tslint:disable-next-line:max-line-length
        "Contract name duplication detected: " + targetBasePath + ".abi. Please make sure that every contract is uniquely named inside the same directory.");
    }
    fs.writeFileSync(targetBasePath + ".bin", compileOutput.bytecode);
    fs.writeFileSync(targetBasePath + ".abi.json", JSON.stringify(JSON.parse(compileOutput.interface), null, 2));
    fs.writeFileSync(targetBasePath + ".abi", compileOutput.interface);
    fs.writeFileSync(targetBasePath + ".gasEstimates.json", JSON.stringify(compileOutput.gasEstimates, null, 2));
};
exports.compileAll = function () {
    var query = path.join(soliditySourceDirectory, '**', '*.sol');
    var candidates = glob.sync(query);
    debug("Compiling " + query + ", " + candidates.length + " files ...");
    var unmerged = candidates.map(function (source) {
        var _a;
        return (_a = {},
            _a[path.relative(path.join(soliditySourceDirectory), source)] = fs.readFileSync(source, {
                encoding: 'utf-8'
            }),
            _a);
    });
    var sources = R.mergeAll(unmerged);
    var output = solc.compile({ sources: sources }, 1, findImports);
    var messages = output.errors;
    var errors = [];
    var warnings = [];
    messages.forEach(function (msg) {
        if (msg.match(/^(.*:[0-9]*:[0-9]* )?Warning: /)) {
            warnings.push(msg);
        }
        else {
            errors.push(msg);
        }
        process.stderr.write(msg);
    });
    debug('Writing compilation results');
    // Delete and recreate out/
    rimraf.sync(solidityCompileTarget);
    mkdirp.sync(solidityCompileTarget);
    fs.writeFileSync(path.join(solidityCompileTarget, 'compilerResult.json'), JSON.stringify(output, null, 2));
    if (messages.length > 0) {
        fs.writeFileSync(path.join(solidityCompileTarget, 'compilerMessages.txt'), output.errors.join('\n\n'));
    }
    R.forEachObjIndexed(writeFiles, output.contracts);
    if (errors.length > 0) {
        debug('Finished with errors');
        process.stderr.write(errors.join('\n\n'));
        process.exit(1);
    }
    else {
        debug('Finished');
        process.exit(0);
    }
};
