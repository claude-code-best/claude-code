import { describe, expect, test } from 'bun:test'
import { createBufferedWriter } from '../bufferedWriter'

describe('createBufferedWriter', () => {
  test('immediateMode calls writeFn directly', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
      immediateMode: true,
    })
    writer.write('a')
    writer.write('b')
    expect(written).toEqual(['a', 'b'])
  })

  test('buffered mode accumulates until flush', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
    })
    writer.write('hello ')
    writer.write('world')
    expect(written).toEqual([])
    writer.flush()
    expect(written).toEqual(['hello world'])
  })

  test('flush with empty buffer does not call writeFn', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
    })
    writer.flush()
    expect(written).toEqual([])
  })

  test('flush clears the buffer', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
    })
    writer.write('data')
    writer.flush()
    writer.flush() // second flush should be no-op
    expect(written).toEqual(['data'])
  })

  test('overflow triggers deferred flush when maxBufferSize reached', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
      maxBufferSize: 2,
    })
    writer.write('a')
    writer.write('b')
    // 2 writes = maxBufferSize, triggers flushDeferred via setImmediate
    expect(written).toEqual([])
  })

  test('overflow triggers deferred flush when maxBufferBytes reached', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
      maxBufferBytes: 5,
    })
    writer.write('abc')
    writer.write('def')
    // total 6 bytes > 5, triggers flushDeferred
    expect(written).toEqual([])
  })

  test('dispose flushes remaining buffer', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
    })
    writer.write('final')
    writer.dispose()
    expect(written).toEqual(['final'])
  })

  test('dispose flushes pending overflow', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
      maxBufferSize: 1,
    })
    writer.write('overflow-data')
    // overflow triggered but deferred; dispose should flush it synchronously
    writer.dispose()
    expect(written).toEqual(['overflow-data'])
  })

  test('coalesced overflow — multiple overflows merge before write', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
      maxBufferSize: 1,
    })
    writer.write('a') // triggers first overflow (deferred)
    writer.write('b') // pendingOverflow exists, coalesces
    writer.dispose() // flushes coalesced overflow
    expect(written).toEqual(['ab'])
  })

  test('multiple flushes produce concatenated writes', () => {
    const written: string[] = []
    const writer = createBufferedWriter({
      writeFn: c => written.push(c),
    })
    writer.write('batch1')
    writer.flush()
    writer.write('batch2')
    writer.flush()
    expect(written).toEqual(['batch1', 'batch2'])
  })
})
