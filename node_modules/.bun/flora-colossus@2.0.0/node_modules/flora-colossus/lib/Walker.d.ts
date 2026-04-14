import { DepType } from './depTypes';
import { NativeModuleType } from './nativeModuleTypes';
export declare type VersionRange = string;
export interface PackageJSON {
    name: string;
    dependencies: {
        [name: string]: VersionRange;
    };
    devDependencies: {
        [name: string]: VersionRange;
    };
    optionalDependencies: {
        [name: string]: VersionRange;
    };
}
export interface Module {
    path: string;
    depType: DepType;
    nativeModuleType: NativeModuleType;
    name: string;
}
export declare class Walker {
    private rootModule;
    private modules;
    private walkHistory;
    constructor(modulePath: string);
    private relativeModule;
    private loadPackageJSON;
    private walkDependenciesForModuleInModule;
    private detectNativeModuleType;
    private walkDependenciesForModule;
    private cache;
    walkTree(): Promise<Module[]>;
    getRootModule(): string;
}
