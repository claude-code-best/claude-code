import { toString as qrToString } from 'qrcode'

export interface QRCodeResult {
  qrcodeUrl?: string
  qrcodeId: string
  message: string
}

export interface LoginResult {
  connected: boolean
  token?: string
  accountId?: string
  baseUrl?: string
  userId?: string
  message: string
}

async function renderQrCodeToTerminal(qrcodeUrl: string): Promise<void> {
  const output = await qrToString(qrcodeUrl, {
    type: 'terminal',
    errorCorrectionLevel: 'L',
    small: true,
  })
  process.stderr.write(`${output}\n`)
}

export async function startLogin(apiBaseUrl: string): Promise<QRCodeResult> {
  const response = await fetch(`${apiBaseUrl}/ilink/bot/get_bot_qrcode?bot_type=3`)
  if (!response.ok) {
    throw new Error(`Failed to get QR code: HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    qrcode?: string
    qrcode_img_content?: string
  }

  if (!data.qrcode) {
    throw new Error('No qrcode in response')
  }

  const qrcodeUrl = data.qrcode_img_content || ''
  if (qrcodeUrl) {
    await renderQrCodeToTerminal(qrcodeUrl)
  }

  return {
    qrcodeUrl,
    qrcodeId: data.qrcode,
    message: 'Scan the QR code with WeChat to connect.',
  }
}

export async function waitForLogin(params: {
  qrcodeId: string
  apiBaseUrl: string
  timeoutMs?: number
  maxRetries?: number
}): Promise<LoginResult> {
  const { qrcodeId, apiBaseUrl, timeoutMs = 480_000, maxRetries = 3 } = params
  const deadline = Date.now() + timeoutMs
  let currentQrcodeId = qrcodeId
  let retryCount = 0

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)

      const response = await fetch(
        `${apiBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(currentQrcodeId)}`,
        {
          headers: { 'iLink-App-ClientVersion': '1' },
          signal: controller.signal,
        },
      )
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as {
        status?: string
        bot_token?: string
        ilink_bot_id?: string
        baseurl?: string
        ilink_user_id?: string
      }

      switch (data.status) {
        case 'confirmed':
          return {
            connected: true,
            token: data.bot_token,
            accountId: data.ilink_bot_id,
            baseUrl: data.baseurl,
            userId: data.ilink_user_id,
            message: 'Connected to WeChat successfully!',
          }
        case 'scaned':
          process.stderr.write(
            'QR code scanned, waiting for confirmation...\n',
          )
          break
        case 'expired': {
          retryCount += 1
          if (retryCount >= maxRetries) {
            return {
              connected: false,
              message: 'QR code expired after maximum retries.',
            }
          }
          process.stderr.write('QR code expired, refreshing...\n')
          const refreshed = await startLogin(apiBaseUrl)
          currentQrcodeId = refreshed.qrcodeId
          break
        }
        case 'wait':
        default:
          break
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        continue
      }
      throw error
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return { connected: false, message: 'Login timed out.' }
}
