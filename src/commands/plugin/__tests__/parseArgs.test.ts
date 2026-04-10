import { describe, expect, test } from 'bun:test'
import { parsePluginArgs } from '../parseArgs'

describe('parsePluginArgs', () => {
  // No args
  test("returns { type: 'menu' } for undefined", () => {
    expect(parsePluginArgs(undefined)).toEqual({ type: 'menu' })
  })

  test("returns { type: 'menu' } for empty string", () => {
    expect(parsePluginArgs('')).toEqual({ type: 'menu' })
  })

  test("returns { type: 'menu' } for whitespace only", () => {
    expect(parsePluginArgs('   ')).toEqual({ type: 'menu' })
  })

  // Help
  test("returns { type: 'help' } for 'help'", () => {
    expect(parsePluginArgs('help')).toEqual({ type: 'help' })
  })

  test("returns { type: 'help' } for '--help'", () => {
    expect(parsePluginArgs('--help')).toEqual({ type: 'help' })
  })

  test("returns { type: 'help' } for '-h'", () => {
    expect(parsePluginArgs('-h')).toEqual({ type: 'help' })
  })

  // Install
  test("parses 'install my-plugin' -> { type: 'install', plugin: 'my-plugin' }", () => {
    expect(parsePluginArgs('install my-plugin')).toEqual({
      type: 'install',
      plugin: 'my-plugin',
    })
  })

  test("parses 'install my-plugin@github' with marketplace", () => {
    expect(parsePluginArgs('install my-plugin@github')).toEqual({
      type: 'install',
      plugin: 'my-plugin',
      marketplace: 'github',
    })
  })

  test("parses 'install https://github.com/...' as URL marketplace", () => {
    expect(
      parsePluginArgs('install https://github.com/plugins/my-plugin'),
    ).toEqual({
      type: 'install',
      marketplace: 'https://github.com/plugins/my-plugin',
    })
  })

  test("parses 'i plugin' as install shorthand", () => {
    expect(parsePluginArgs('i plugin')).toEqual({
      type: 'install',
      plugin: 'plugin',
    })
  })

  test('install without target returns type only', () => {
    expect(parsePluginArgs('install')).toEqual({ type: 'install' })
  })

  // Uninstall
  test("returns { type: 'uninstall', plugin: '...' }", () => {
    expect(parsePluginArgs('uninstall my-plugin')).toEqual({
      type: 'uninstall',
      plugin: 'my-plugin',
    })
  })

  // Enable/disable
  test("returns { type: 'enable', plugin: '...' }", () => {
    expect(parsePluginArgs('enable my-plugin')).toEqual({
      type: 'enable',
      plugin: 'my-plugin',
    })
  })

  test("returns { type: 'disable', plugin: '...' }", () => {
    expect(parsePluginArgs('disable my-plugin')).toEqual({
      type: 'disable',
      plugin: 'my-plugin',
    })
  })

  // Validate
  test("returns { type: 'validate', path: '...' }", () => {
    expect(parsePluginArgs('validate /path/to/plugin')).toEqual({
      type: 'validate',
      path: '/path/to/plugin',
    })
  })

  // Manage
  test("returns { type: 'manage' }", () => {
    expect(parsePluginArgs('manage')).toEqual({ type: 'manage' })
  })

  // Marketplace
  test("parses 'marketplace add ...'", () => {
    expect(parsePluginArgs('marketplace add https://example.com')).toEqual({
      type: 'marketplace',
      action: 'add',
      target: 'https://example.com',
    })
  })

  test("parses 'marketplace remove ...'", () => {
    expect(parsePluginArgs('marketplace remove my-source')).toEqual({
      type: 'marketplace',
      action: 'remove',
      target: 'my-source',
    })
  })

  test("parses 'marketplace list'", () => {
    expect(parsePluginArgs('marketplace list')).toEqual({
      type: 'marketplace',
      action: 'list',
    })
  })

  test("parses 'market' as alias for 'marketplace'", () => {
    expect(parsePluginArgs('market list')).toEqual({
      type: 'marketplace',
      action: 'list',
    })
  })

  // Boundary
  test('handles extra whitespace', () => {
    expect(parsePluginArgs('  install   my-plugin  ')).toEqual({
      type: 'install',
      plugin: 'my-plugin',
    })
  })

  test('handles unknown subcommand gracefully', () => {
    expect(parsePluginArgs('foobar')).toEqual({ type: 'menu' })
  })

  test('marketplace without action returns type only', () => {
    expect(parsePluginArgs('marketplace')).toEqual({ type: 'marketplace' })
  })
})
