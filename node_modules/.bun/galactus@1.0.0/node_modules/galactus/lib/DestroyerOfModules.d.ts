import { Module, Walker } from 'flora-colossus';
export declare type ShouldKeepModuleTest = (module: Module, isDevDep: boolean) => boolean;
export declare type ModuleMap = Map<string, Module>;
export declare class DestroyerOfModules {
    private walker;
    private shouldKeepFn?;
    constructor({ rootDirectory, walker, shouldKeepModuleTest, }: {
        rootDirectory?: string;
        walker?: Walker;
        shouldKeepModuleTest?: ShouldKeepModuleTest;
    });
    destroyModule(modulePath: string, moduleMap: ModuleMap): Promise<void>;
    collectKeptModules({ relativePaths }: {
        relativePaths: boolean;
    }): Promise<ModuleMap>;
    destroy(): Promise<void>;
    private shouldKeepModule;
}
