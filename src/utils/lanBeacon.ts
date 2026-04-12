/**
 * LAN Beacon — UDP multicast peer discovery for Pipes system.
 *
 * Uses multicast group 224.0.71.67 ("CC" = Claude Code ASCII) on port 7101
 * to announce and discover CLI instances on the local network.
 *
 * Feature-gated by LAN_PIPES.
 */

import { createSocket, type Socket as DgramSocket } from 'dgram'
import { EventEmitter } from 'events'
import { logError } from './log.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MULTICAST_GROUP = '224.0.71.67'
const MULTICAST_PORT = 7101
const ANNOUNCE_INTERVAL_MS = 3000
const PEER_TIMEOUT_MS = 15000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LanAnnounce = {
  proto: 'claude-pipe-v1'
  pipeName: string
  machineId: string
  hostname: string
  ip: string
  tcpPort: number
  role: 'main' | 'sub'
  ts: number
}

// ---------------------------------------------------------------------------
// LanBeacon
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level singleton — avoids (state as any)._lanBeacon hack
// ---------------------------------------------------------------------------

let _lanBeaconInstance: LanBeacon | null = null

export function getLanBeacon(): LanBeacon | null {
  return _lanBeaconInstance
}

export function setLanBeacon(instance: LanBeacon | null): void {
  _lanBeaconInstance = instance
}

// ---------------------------------------------------------------------------
// LanBeacon class
// ---------------------------------------------------------------------------

export class LanBeacon extends EventEmitter {
  private socket: DgramSocket | null = null
  private announceTimer: ReturnType<typeof setInterval> | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private peers: Map<string, LanAnnounce> = new Map()
  private announce: LanAnnounce

  constructor(announce: Omit<LanAnnounce, 'proto' | 'ts'>) {
    super()
    this.announce = {
      ...announce,
      proto: 'claude-pipe-v1',
      ts: Date.now(),
    }
  }

  /**
   * Start broadcasting announcements and listening for peers.
   */
  start(): void {
    if (this.socket) return

    try {
      this.socket = createSocket({ type: 'udp4', reuseAddr: true })

      this.socket.on('error', err => {
        logError(err)
        // Non-fatal — multicast may not be supported on this network
      })

      this.socket.on('message', (buf, rinfo) => {
        try {
          const msg = JSON.parse(buf.toString()) as LanAnnounce
          if (msg.proto !== 'claude-pipe-v1') return
          if (msg.pipeName === this.announce.pipeName) return // ignore self

          const isNew = !this.peers.has(msg.pipeName)
          this.peers.set(msg.pipeName, { ...msg, ts: Date.now() })

          if (isNew) {
            this.emit('peer-discovered', msg)
          }
        } catch {
          // Malformed packet — ignore
        }
      })

      this.socket.bind(MULTICAST_PORT, () => {
        try {
          // Specify the local LAN interface for multicast membership.
          // Without this, Windows may bind to a WSL/Docker virtual adapter
          // and multicast packets never reach the real LAN.
          const localIp = this.announce.ip
          this.socket!.addMembership(MULTICAST_GROUP, localIp)
          this.socket!.setMulticastInterface(localIp)
          this.socket!.setMulticastTTL(1) // link-local only
          this.socket!.setBroadcast(true)
        } catch (err) {
          logError(err as Error)
        }

        // Start announce + cleanup timers after socket is fully bound
        this.announceTimer = setInterval(
          () => this.sendAnnounce(),
          ANNOUNCE_INTERVAL_MS,
        )
        // Send first announce immediately
        this.sendAnnounce()

        // Periodic cleanup of stale peers
        this.cleanupTimer = setInterval(
          () => this.cleanupStalePeers(),
          PEER_TIMEOUT_MS / 2,
        )
      })
    } catch (err) {
      logError(err as Error)
    }
  }

  /**
   * Stop broadcasting and close the socket.
   */
  stop(): void {
    if (this.announceTimer) {
      clearInterval(this.announceTimer)
      this.announceTimer = null
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    if (this.socket) {
      try {
        this.socket.dropMembership(MULTICAST_GROUP)
      } catch {
        // May fail if socket already closed
      }
      this.socket.close()
      this.socket = null
    }
    this.peers.clear()
  }

  /**
   * Get all currently known peers (excluding self).
   */
  getPeers(): Map<string, LanAnnounce> {
    return new Map(this.peers)
  }

  /**
   * Update the announce data (e.g., when role changes).
   */
  updateAnnounce(partial: Partial<Omit<LanAnnounce, 'proto' | 'ts'>>): void {
    this.announce = { ...this.announce, ...partial }
  }

  private sendAnnounce(): void {
    if (!this.socket) return
    try {
      const payload = Buffer.from(
        JSON.stringify({ ...this.announce, ts: Date.now() }),
      )
      this.socket.send(
        payload,
        0,
        payload.length,
        MULTICAST_PORT,
        MULTICAST_GROUP,
      )
    } catch {
      // Send failure — non-fatal
    }
  }

  private cleanupStalePeers(): void {
    const now = Date.now()
    for (const [name, peer] of this.peers) {
      if (now - peer.ts > PEER_TIMEOUT_MS) {
        this.peers.delete(name)
        this.emit('peer-lost', name)
      }
    }
  }
}
