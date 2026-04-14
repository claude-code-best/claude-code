"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Walker = void 0;
const debug = require("debug");
const fs = require("fs-extra");
const path = require("path");
const depTypes_1 = require("./depTypes");
const nativeModuleTypes_1 = require("./nativeModuleTypes");
const d = debug('flora-colossus');
class Walker {
    constructor(modulePath) {
        this.modules = [];
        this.walkHistory = new Set();
        this.cache = null;
        if (!modulePath || typeof modulePath !== 'string') {
            throw new Error('modulePath must be provided as a string');
        }
        d(`creating walker with rootModule=${modulePath}`);
        this.rootModule = modulePath;
    }
    relativeModule(rootPath, moduleName) {
        return path.resolve(rootPath, 'node_modules', moduleName);
    }
    async loadPackageJSON(modulePath) {
        const pJPath = path.resolve(modulePath, 'package.json');
        if (await fs.pathExists(pJPath)) {
            const pJ = await fs.readJson(pJPath);
            if (!pJ.dependencies)
                pJ.dependencies = {};
            if (!pJ.devDependencies)
                pJ.devDependencies = {};
            if (!pJ.optionalDependencies)
                pJ.optionalDependencies = {};
            return pJ;
        }
        return null;
    }
    async walkDependenciesForModuleInModule(moduleName, modulePath, depType) {
        let testPath = modulePath;
        let discoveredPath = null;
        let lastRelative = null;
        // Try find it while searching recursively up the tree
        while (!discoveredPath && this.relativeModule(testPath, moduleName) !== lastRelative) {
            lastRelative = this.relativeModule(testPath, moduleName);
            if (await fs.pathExists(lastRelative)) {
                discoveredPath = lastRelative;
            }
            else {
                if (path.basename(path.dirname(testPath)) !== 'node_modules') {
                    testPath = path.dirname(testPath);
                }
                testPath = path.dirname(path.dirname(testPath));
            }
        }
        // If we can't find it the install is probably buggered
        if (!discoveredPath && depType !== depTypes_1.DepType.OPTIONAL && depType !== depTypes_1.DepType.DEV_OPTIONAL) {
            throw new Error(`Failed to locate module "${moduleName}" from "${modulePath}"

        This normally means that either you have deleted this package already somehow (check your ignore settings if using electron-packager).  Or your module installation failed.`);
        }
        // If we can find it let's do the same thing for that module
        if (discoveredPath) {
            await this.walkDependenciesForModule(discoveredPath, depType);
        }
    }
    async detectNativeModuleType(modulePath, pJ) {
        if (pJ.dependencies['prebuild-install']) {
            return nativeModuleTypes_1.NativeModuleType.PREBUILD;
        }
        else if (await fs.pathExists(path.join(modulePath, 'binding.gyp'))) {
            return nativeModuleTypes_1.NativeModuleType.NODE_GYP;
        }
        return nativeModuleTypes_1.NativeModuleType.NONE;
    }
    async walkDependenciesForModule(modulePath, depType) {
        d('walk reached:', modulePath, ' Type is:', depTypes_1.DepType[depType]);
        // We have already traversed this module
        if (this.walkHistory.has(modulePath)) {
            d('already walked this route');
            // Find the existing module reference
            const existingModule = this.modules.find(module => module.path === modulePath);
            // If the depType we are traversing with now is higher than the
            // last traversal then update it (prod superseeds dev for instance)
            if ((0, depTypes_1.depTypeGreater)(depType, existingModule.depType)) {
                d(`existing module has a type of "${existingModule.depType}", new module type would be "${depType}" therefore updating`);
                existingModule.depType = depType;
            }
            return;
        }
        const pJ = await this.loadPackageJSON(modulePath);
        // If the module doesn't have a package.json file it is probably a
        // dead install from yarn (they dont clean up for some reason)
        if (!pJ) {
            d('walk hit a dead end, this module is incomplete');
            return;
        }
        // Record this module as being traversed
        this.walkHistory.add(modulePath);
        this.modules.push({
            depType,
            nativeModuleType: await this.detectNativeModuleType(modulePath, pJ),
            path: modulePath,
            name: pJ.name,
        });
        // For every prod dep
        for (const moduleName in pJ.dependencies) {
            // npm decides it's a funny thing to put optional dependencies in the "dependencies" section
            // after install, because that makes perfect sense
            if (moduleName in pJ.optionalDependencies) {
                d(`found ${moduleName} in prod deps of ${modulePath} but it is also marked optional`);
                continue;
            }
            await this.walkDependenciesForModuleInModule(moduleName, modulePath, (0, depTypes_1.childDepType)(depType, depTypes_1.DepType.PROD));
        }
        // For every optional dep
        for (const moduleName in pJ.optionalDependencies) {
            await this.walkDependenciesForModuleInModule(moduleName, modulePath, (0, depTypes_1.childDepType)(depType, depTypes_1.DepType.OPTIONAL));
        }
        // For every dev dep, but only if we are in the root module
        if (depType === depTypes_1.DepType.ROOT) {
            d('we\'re still at the beginning, walking down the dev route');
            for (const moduleName in pJ.devDependencies) {
                await this.walkDependenciesForModuleInModule(moduleName, modulePath, (0, depTypes_1.childDepType)(depType, depTypes_1.DepType.DEV));
            }
        }
    }
    async walkTree() {
        d('starting tree walk');
        if (!this.cache) {
            this.cache = new Promise(async (resolve, reject) => {
                this.modules = [];
                try {
                    await this.walkDependenciesForModule(this.rootModule, depTypes_1.DepType.ROOT);
                }
                catch (err) {
                    reject(err);
                    return;
                }
                resolve(this.modules);
            });
        }
        else {
            d('tree walk in progress / completed already, waiting for existing walk to complete');
        }
        return await this.cache;
    }
    getRootModule() {
        return this.rootModule;
    }
}
exports.Walker = Walker;
//# sourceMappingURL=Walker.js.map