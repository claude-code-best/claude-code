import { OAuth2Client } from 'google-auth-library'
import { AuthCodeListener } from 'src/services/oauth/auth-code-listener.js'
import { openBrowser } from 'src/utils/browser.js'
import { updateSettingsForSource } from 'src/utils/settings/settings.js'
import { getInitialSettings as getSettings } from 'src/utils/settings/settings.js'
import { logEvent } from 'src/services/analytics/index.js'
import * as crypto from 'crypto' // For state generation if needed
import * as fs from 'fs'
import * as path from 'path'

let GOOGLE_CLIENT_ID = ''
let GOOGLE_CLIENT_SECRET = ''

try {
  const oauthPath = path.join(process.cwd(), '.files', 'OAuth.json')
  if (fs.existsSync(oauthPath)) {
    const data = JSON.parse(fs.readFileSync(oauthPath, 'utf8'))
    const config = data.web || data.installed
    if (config && config.client_id && config.client_secret) {
      GOOGLE_CLIENT_ID = config.client_id
      GOOGLE_CLIENT_SECRET = config.client_secret
    }
  }
} catch (e) {
  // Ignore errors reading OAuth.json
}
const SCOPES = [
  'https://www.googleapis.com/auth/generative-language.retriever',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export async function loginToGoogle(): Promise<void> {
  const listener = new AuthCodeListener('/')
  try {
    const port = await listener.start()
    const redirectUri = `http://localhost:${port}/`

    const oauth2Client = new OAuth2Client({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri,
    })

    const state = crypto.randomBytes(16).toString('hex')

    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent', // Force to get refresh token
    })

    const authCode = await listener.waitForAuthorization(state, async () => {
      await openBrowser(authorizeUrl)
    })

    const { tokens } = await oauth2Client.getToken(authCode)

    // Save tokens
    updateSettingsForSource('userSettings', {
      googleOAuth: {
        access_token: tokens.access_token ?? undefined,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
      },
    })

    listener.handleSuccessRedirect(SCOPES, res => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <head>
            <title>Authentication successful</title>
            <style>
              body { font-family: sans-serif; padding: 2rem; }
              h1 { color: #1a73e8; }
              ul { line-height: 1.6; }
            </style>
          </head>
          <body>
            <h1>Authentication successful</h1>
            <p>The authentication was successful, and the following products are now authorized to access your account:</p>
            <ul>
              <li>Gemini Code Assist</li>
              <li>Cloud Code with Gemini Code Assist</li>
              <li>Gemini CLI</li>
              <li>Antigravity (available only for free, Google One AI Pro, Google One AI Ultra, and Google Workspace AI Ultra for Business)</li>
            </ul>
            <p>You can close this window and return to your IDE or terminal.</p>
            <script>window.close();</script>
          </body>
        </html>
      `)
    })

    logEvent('tengu_google_oauth_success', {})
  } catch (error) {
    listener.handleErrorRedirect()
    logEvent('tengu_google_oauth_error', {})
    throw error
  } finally {
    listener.close()
  }
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const settings = getSettings()
  const googleOAuth = settings.googleOAuth

  if (!googleOAuth || !googleOAuth.refresh_token) {
    return null
  }

  const oauth2Client = new OAuth2Client({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  })

  oauth2Client.setCredentials({
    refresh_token: googleOAuth.refresh_token,
    access_token: googleOAuth.access_token,
    expiry_date: googleOAuth.expiry_date,
  })

  try {
    const { credentials } = await oauth2Client.refreshAccessToken()
    if (credentials.access_token !== googleOAuth.access_token) {
      updateSettingsForSource('userSettings', {
        googleOAuth: {
          access_token: credentials.access_token ?? undefined,
          refresh_token: credentials.refresh_token || googleOAuth.refresh_token,
          expiry_date: credentials.expiry_date ?? undefined,
        },
      })
    }
    return credentials.access_token || null
  } catch (error) {
    // If refresh fails, clear it
    updateSettingsForSource('userSettings', {
      googleOAuth: undefined,
    })
    return null
  }
}
