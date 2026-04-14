export declare enum DepType {
    PROD = 0,
    DEV = 1,
    OPTIONAL = 2,
    DEV_OPTIONAL = 3,
    ROOT = 4
}
export declare const depTypeGreater: (newType: DepType, existing: DepType) => boolean;
export declare const childDepType: (parentType: DepType, childType: DepType) => DepType.PROD | DepType.DEV | DepType.OPTIONAL | DepType.DEV_OPTIONAL;
