"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.childDepType = exports.depTypeGreater = exports.DepType = void 0;
var DepType;
(function (DepType) {
    DepType[DepType["PROD"] = 0] = "PROD";
    DepType[DepType["DEV"] = 1] = "DEV";
    DepType[DepType["OPTIONAL"] = 2] = "OPTIONAL";
    DepType[DepType["DEV_OPTIONAL"] = 3] = "DEV_OPTIONAL";
    DepType[DepType["ROOT"] = 4] = "ROOT";
})(DepType = exports.DepType || (exports.DepType = {}));
const depTypeGreater = (newType, existing) => {
    switch (existing) {
        case DepType.DEV:
            switch (newType) {
                case DepType.OPTIONAL:
                case DepType.PROD:
                case DepType.ROOT:
                    return true;
                case DepType.DEV:
                case DepType.DEV_OPTIONAL:
                default:
                    return false;
            }
        case DepType.DEV_OPTIONAL:
            switch (newType) {
                case DepType.OPTIONAL:
                case DepType.PROD:
                case DepType.ROOT:
                case DepType.DEV:
                    return true;
                case DepType.DEV_OPTIONAL:
                default:
                    return false;
            }
        case DepType.OPTIONAL:
            switch (newType) {
                case DepType.PROD:
                case DepType.ROOT:
                    return true;
                case DepType.OPTIONAL:
                case DepType.DEV:
                case DepType.DEV_OPTIONAL:
                default:
                    return false;
            }
        case DepType.PROD:
            switch (newType) {
                case DepType.ROOT:
                    return true;
                case DepType.PROD:
                case DepType.OPTIONAL:
                case DepType.DEV:
                case DepType.DEV_OPTIONAL:
                default:
                    return false;
            }
        case DepType.ROOT:
            switch (newType) {
                case DepType.ROOT:
                case DepType.PROD:
                case DepType.OPTIONAL:
                case DepType.DEV:
                case DepType.DEV_OPTIONAL:
                default:
                    return false;
            }
        default:
            return false;
    }
};
exports.depTypeGreater = depTypeGreater;
const childDepType = (parentType, childType) => {
    if (childType === DepType.ROOT) {
        throw new Error('Something went wrong, a child dependency can\'t be marked as the ROOT');
    }
    switch (parentType) {
        case DepType.ROOT:
            return childType;
        case DepType.PROD:
            if (childType === DepType.OPTIONAL)
                return DepType.OPTIONAL;
            return DepType.PROD;
        case DepType.OPTIONAL:
            return DepType.OPTIONAL;
        case DepType.DEV_OPTIONAL:
            return DepType.DEV_OPTIONAL;
        case DepType.DEV:
            if (childType === DepType.OPTIONAL)
                return DepType.DEV_OPTIONAL;
            return DepType.DEV;
    }
};
exports.childDepType = childDepType;
//# sourceMappingURL=depTypes.js.map