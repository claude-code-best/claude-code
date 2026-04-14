/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ResponseMode } from "../utils/Constants.js";
import { BaseAuthRequest } from "./BaseAuthRequest.js";
import { AccountInfo } from "../account/AccountInfo.js";

/**
 * Request object passed by user to retrieve a Code from the server (first leg of authorization code grant flow)
 */
export type CommonAuthorizationUrlRequest = BaseAuthRequest & {
    /**
     * The redirect URI where authentication responses can be received by your application. It must exactly match one of the redirect URIs registered in the Azure portal.
     */
    redirectUri: string;
    /**
     * Specifies the method that should be used to send the authentication result to your app. Can be query, form_post, or fragment. If no value is passed in, it defaults to query.
     */
    responseMode: ResponseMode;
    /**
     * AccountInfo obtained from a getAccount API. Will be used in certain scenarios to generate login_hint if both loginHint and sid params are not provided.
     */
    account?: AccountInfo;
    /**
     * JSON Web Key used when constructing Encrypted Authorize Response (EAR) parameters.
     */
    earJwk?: string;
    /**
     * Used to secure authorization code grant via Proof of Key for Code Exchange (PKCE). For more information, see the PKCE RCF:https://tools.ietf.org/html/rfc7636
     */
    codeChallenge?: string;
    /**
     * The method used to encode the code verifier for the code challenge parameter. Can be "plain" or "S256". If excluded, code challenge is assumed to be plaintext. For more information, see the PKCE RCF: https://tools.ietf.org/html/rfc7636
     */
    codeChallengeMethod?: string;
    /**
     * Provides a hint about the tenant or domain that the user should use to sign in. The value of the domain hint is a registered domain for the tenant.
     */
    domainHint?: string;
    /**
     * Scopes for a different resource when the user needs consent upfront.
     */
    extraScopesToConsent?: Array<string>;
    /**
     * Can be used to pre-fill the username/email address field of the sign-in page for the user, if you know the username/email address ahead of time. Can also be the string value extracted from the login_hint claim on an idToken obtained previously to provide SSO.
     */
    loginHint?: string;
    /**
     * A value included in the request that is returned in the id token. A randomly generated unique value is typically used to mitigate replay attacks.
     */
    nonce: string;
    /**
     * Indicates the type of user interaction that is required.
     *          login: will force the user to enter their credentials on that request, negating single-sign on
     *          none:  will ensure that the user isn't presented with any interactive prompt. if request can't be completed via single-sign on, the endpoint will return an interaction_required error
     *          consent: will the trigger the OAuth consent dialog after the user signs in, asking the user to grant permissions to the app
     *          select_account: will interrupt single sign-=on providing account selection experience listing all the accounts in session or any remembered accounts or an option to choose to use a different account
     *          create: will direct the user to the account creation experience instead of the log in experience
     *          no_session: will not read existing session token when authenticating the user. Upon user being successfully authenticated, EVO won’t create a new session for the user. FOR INTERNAL USE ONLY.
     */
    prompt?: string;
    /**
     * Session ID, unique identifier for the session. Available as an optional claim on ID tokens. Use login_hint optional claim provided on loginHint paramter instead, when available.
     */
    sid?: string;
    /**
     * A value included in the request that is also returned in the token response. A randomly generated unique value is typically used for preventing cross site request forgery attacks. The state is also used to encode information about the user's state in the app before the authentication request occurred. For security and privacy reasons, we do not recommend putting URLs or other sensitive data directly in the state parameter. Instead, use a key or identifier that corresponds to data stored in browser storage (e.g., localStorage, sessionStorage), allowing your app to securely reference the necessary data after authentication.
     */
    state: string;
    /**
     * Indicates whether this authorization request is being initiated by a platform authentication broker instead of a standard web flow.
     */
    platformBroker?: boolean;
};
