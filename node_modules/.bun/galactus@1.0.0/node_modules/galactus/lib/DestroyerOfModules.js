"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DestroyerOfModules = void 0;
const fs = require("fs-extra");
const path = require("path");
const flora_colossus_1 = require("flora-colossus");
class DestroyerOfModules {
    constructor({ rootDirectory, walker, shouldKeepModuleTest, }) {
        if (rootDirectory) {
            this.walker = new flora_colossus_1.Walker(rootDirectory);
        }
        else if (walker) {
            this.walker = walker;
        }
        else {
            throw new Error('Must either provide rootDirectory or walker argument');
        }
        if (shouldKeepModuleTest) {
            this.shouldKeepFn = shouldKeepModuleTest;
        }
    }
    async destroyModule(modulePath, moduleMap) {
        const module = moduleMap.get(modulePath);
        if (module) {
            const nodeModulesPath = path.resolve(modulePath, 'node_modules');
            if (!await fs.pathExists(nodeModulesPath)) {
                return;
            }
            for (const subModuleName of await fs.readdir(nodeModulesPath)) {
                if (subModuleName.startsWith('@')) {
                    for (const subScopedModuleName of await fs.readdir(path.resolve(nodeModulesPath, subModuleName))) {
                        await this.destroyModule(path.resolve(nodeModulesPath, subModuleName, subScopedModuleName), moduleMap);
                    }
                }
                else {
                    await this.destroyModule(path.resolve(nodeModulesPath, subModuleName), moduleMap);
                }
            }
        }
        else {
            await fs.remove(modulePath);
        }
    }
    async collectKeptModules({ relativePaths = false }) {
        const modules = await this.walker.walkTree();
        const moduleMap = new Map();
        const rootPath = path.resolve(this.walker.getRootModule());
        for (const module of modules) {
            if (this.shouldKeepModule(module)) {
                let modulePath = module.path;
                if (relativePaths) {
                    modulePath = modulePath.replace(`${rootPath}${path.sep}`, '');
                }
                moduleMap.set(modulePath, module);
            }
        }
        return moduleMap;
    }
    async destroy() {
        await this.destroyModule(this.walker.getRootModule(), await this.collectKeptModules({ relativePaths: false }));
    }
    shouldKeepModule(module) {
        const isDevDep = module.depType === flora_colossus_1.DepType.DEV || module.depType === flora_colossus_1.DepType.DEV_OPTIONAL;
        const shouldKeep = this.shouldKeepFn ? this.shouldKeepFn(module, isDevDep) : !isDevDep;
        return shouldKeep;
    }
}
exports.DestroyerOfModules = DestroyerOfModules;
//# sourceMappingURL=DestroyerOfModules.js.map