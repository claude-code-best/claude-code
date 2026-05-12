import { useState, useEffect, useRef, useCallback } from 'react'
import QrScanner from 'qr-scanner'

/** QR code data format for scanning */
export interface QRCodeData {
  url: string
  token: string
}

export interface UseQRScannerOptions {
  /** Called when a valid QR code is scanned */
  onScan: (data: QRCodeData) => void
  /** Called when an error occurs */
  onError?: (error: string) => void
}

export interface UseQRScannerResult {
  /** Whether the scanner is currently active */
  isScanning: boolean
  /** Ref to attach to the video element */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Start scanning */
  startScanning: () => void
  /** Stop scanning */
  stopScanning: () => void
  /** Scan QR code from a file (e.g., from photo album) */
  scanFromFile: (file: File) => Promise<void>
}

/**
 * Hook for QR code scanning functionality.
 * Manages QrScanner lifecycle and camera access.
 */
export function useQRScanner({
  onScan,
  onError,
}: UseQRScannerOptions): UseQRScannerResult {
  const [isScanning, setIsScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const qrScannerRef = useRef<QrScanner | null>(null)

  // Store callbacks in refs to avoid re-creating scanner when callbacks change
  // This allows callers to pass inline functions without causing re-renders
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)

  // Keep refs up to date
  useEffect(() => {
    onScanRef.current = onScan
    onErrorRef.current = onError
  }, [onScan, onError])

  const startScanning = useCallback(() => {
    setIsScanning(true)
  }, [])

  const stopScanning = useCallback(() => {
    if (qrScannerRef.current) {
      qrScannerRef.current.stop()
      qrScannerRef.current.destroy()
      qrScannerRef.current = null
    }
    setIsScanning(false)
  }, [])

  // Scan QR code from a file (photo album)
  const scanFromFile = useCallback(async (file: File) => {
    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
      })

      const data = JSON.parse(result.data) as QRCodeData
      if (data.url && data.token) {
        onScanRef.current(data)
      } else {
        onErrorRef.current?.('Invalid QR code: missing url or token')
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No QR code found'
      onErrorRef.current?.(message)
    }
  }, [])

  // Initialize scanner when isScanning becomes true
  useEffect(() => {
    if (!isScanning || !videoRef.current) return

    let isCancelled = false
    let scanner: QrScanner | null = null

    const initScanner = async () => {
      try {
        const newScanner = new QrScanner(
          videoRef.current!,
          result => {
            try {
              const data = JSON.parse(result.data) as QRCodeData
              if (data.url && data.token) {
                // Stop scanning and notify
                newScanner.stop()
                newScanner.destroy()
                qrScannerRef.current = null
                setIsScanning(false)
                onScanRef.current(data)
              }
            } catch {
              // Not valid JSON, ignore
            }
          },
          {
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
          },
        )

        if (isCancelled) {
          newScanner.destroy()
          return
        }

        scanner = newScanner
        qrScannerRef.current = newScanner
        await newScanner.start()

        if (isCancelled) {
          newScanner.stop()
          newScanner.destroy()
          qrScannerRef.current = null
        }
      } catch (e) {
        if (!isCancelled) {
          onErrorRef.current?.(`Camera error: ${(e as Error).message}`)
          setIsScanning(false)
        }
      }
    }

    initScanner()

    return () => {
      isCancelled = true
      if (scanner) {
        scanner.stop()
        scanner.destroy()
      }
      if (qrScannerRef.current) {
        qrScannerRef.current.stop()
        qrScannerRef.current.destroy()
        qrScannerRef.current = null
      }
    }
  }, [isScanning]) // Only depend on isScanning, callbacks are accessed via refs

  return {
    isScanning,
    videoRef,
    startScanning,
    stopScanning,
    scanFromFile,
  }
}
