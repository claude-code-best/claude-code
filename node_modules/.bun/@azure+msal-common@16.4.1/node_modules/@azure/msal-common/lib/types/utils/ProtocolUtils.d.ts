import { ICrypto } from "../crypto/ICrypto.js";
import { RequestStateObject } from "./StateTypes.js";
/**
 * Appends user state with random guid, or returns random guid.
 * @param cryptoObj
 * @param userState
 * @param meta
 */
export declare function setRequestState(cryptoObj: ICrypto, userState?: string, meta?: Record<string, string>): string;
/**
 * Generates the state value used by the common library.
 * @param cryptoObj
 * @param meta
 */
export declare function generateLibraryState(cryptoObj: ICrypto, meta?: Record<string, string>): string;
/**
 * Parses the state into the RequestStateObject, which contains the LibraryState info and the state passed by the user.
 * @param base64Decode
 * @param state
 */
export declare function parseRequestState(base64Decode: (input: string) => string, state: string): RequestStateObject;
//# sourceMappingURL=ProtocolUtils.d.ts.map