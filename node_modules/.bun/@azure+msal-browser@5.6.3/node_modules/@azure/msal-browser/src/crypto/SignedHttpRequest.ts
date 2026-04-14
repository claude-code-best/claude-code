/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CryptoOps } from "./CryptoOps.js";
import {
    Logger,
    LoggerOptions,
    PopTokenGenerator,
    SignedHttpRequestParameters,
    StubPerformanceClient,
} from "@azure/msal-common/browser";
import { version, name } from "../packageMetadata.js";

export type SignedHttpRequestOptions = {
    loggerOptions: LoggerOptions;
};

export class SignedHttpRequest {
    private popTokenGenerator: PopTokenGenerator;
    private cryptoOps: CryptoOps;
    private shrParameters: SignedHttpRequestParameters;
    private logger: Logger;

    constructor(
        shrParameters: SignedHttpRequestParameters,
        shrOptions?: SignedHttpRequestOptions
    ) {
        const loggerOptions = (shrOptions && shrOptions.loggerOptions) || {};
        this.logger = new Logger(loggerOptions, name, version);
        this.cryptoOps = new CryptoOps(this.logger);
        this.popTokenGenerator = new PopTokenGenerator(
            this.cryptoOps,
            new StubPerformanceClient()
        );
        this.shrParameters = shrParameters;
    }

    /**
     * Generates and caches a keypair for the given request options.
     * @returns Public key digest, which should be sent to the token issuer.
     */
    async generatePublicKeyThumbprint(): Promise<string> {
        const { kid } = await this.popTokenGenerator.generateKid(
            this.shrParameters
        );

        return kid;
    }

    /**
     * Generates a signed http request for the given payload with the given key.
     * @param payload Payload to sign (e.g. access token)
     * @param publicKeyThumbprint Public key digest (from generatePublicKeyThumbprint API)
     * @param claims Additional claims to include/override in the signed JWT
     * @returns Pop token signed with the corresponding private key
     */
    async signRequest(
        payload: string,
        publicKeyThumbprint: string,
        claims?: object
    ): Promise<string> {
        return this.popTokenGenerator.signPayload(
            payload,
            publicKeyThumbprint,
            this.shrParameters,
            claims
        );
    }

    /**
     * Removes cached keys from browser for given public key thumbprint
     * @param publicKeyThumbprint Public key digest (from generatePublicKeyThumbprint API)
     * @param correlationId
     * @returns If keys are properly deleted
     */
    async removeKeys(
        publicKeyThumbprint: string,
        correlationId: string
    ): Promise<void> {
        return this.cryptoOps.removeTokenBindingKey(
            publicKeyThumbprint,
            correlationId
        );
    }
}
