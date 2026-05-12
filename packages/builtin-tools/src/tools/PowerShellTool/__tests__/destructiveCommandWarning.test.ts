import { describe, expect, test } from 'bun:test'
import { getDestructiveCommandWarning } from '../destructiveCommandWarning'

describe('getDestructiveCommandWarning', () => {
  describe('recursive force remove', () => {
    test('Remove-Item -Recurse -Force', () => {
      expect(
        getDestructiveCommandWarning('Remove-Item ./x -Recurse -Force'),
      ).toBe('Note: may recursively force-remove files')
    })

    test('rm -Recurse -Force alias', () => {
      expect(getDestructiveCommandWarning('rm ./x -Recurse -Force')).toBe(
        'Note: may recursively force-remove files',
      )
    })

    test('ri -Recurse -Force alias', () => {
      expect(getDestructiveCommandWarning('ri ./x -Recurse -Force')).toBe(
        'Note: may recursively force-remove files',
      )
    })

    test('Remove-Item -Force -Recurse (reversed order)', () => {
      expect(
        getDestructiveCommandWarning('Remove-Item ./x -Force -Recurse'),
      ).toBe('Note: may recursively force-remove files')
    })

    test('Remove-Item -Recurse only', () => {
      expect(getDestructiveCommandWarning('Remove-Item ./x -Recurse')).toBe(
        'Note: may recursively remove files',
      )
    })

    test('Remove-Item -Force only', () => {
      expect(getDestructiveCommandWarning('Remove-Item ./x -Force')).toBe(
        'Note: may force-remove files',
      )
    })
  })

  describe('safe remove commands', () => {
    test('Remove-Item without -Recurse or -Force is safe', () => {
      expect(getDestructiveCommandWarning('Remove-Item ./x')).toBeNull()
    })

    test('del without flags is safe', () => {
      expect(getDestructiveCommandWarning('del ./x')).toBeNull()
    })
  })

  describe('disk operations', () => {
    test('Format-Volume is destructive', () => {
      expect(getDestructiveCommandWarning('Format-Volume -DriveLetter C')).toBe(
        'Note: may format a disk volume',
      )
    })

    test('Clear-Disk is destructive', () => {
      expect(getDestructiveCommandWarning('Clear-Disk -Number 0')).toBe(
        'Note: may clear a disk',
      )
    })
  })

  describe('git destructive operations', () => {
    test('git reset --hard', () => {
      expect(getDestructiveCommandWarning('git reset --hard HEAD~1')).toBe(
        'Note: may discard uncommitted changes',
      )
    })

    test('git push --force', () => {
      expect(getDestructiveCommandWarning('git push --force origin main')).toBe(
        'Note: may overwrite remote history',
      )
    })

    test('git push -f', () => {
      expect(getDestructiveCommandWarning('git push -f')).toBe(
        'Note: may overwrite remote history',
      )
    })

    test('git push --force-with-lease', () => {
      expect(getDestructiveCommandWarning('git push --force-with-lease')).toBe(
        'Note: may overwrite remote history',
      )
    })

    test('git clean -fd', () => {
      expect(getDestructiveCommandWarning('git clean -fd')).toBe(
        'Note: may permanently delete untracked files',
      )
    })

    test('git clean -fdx', () => {
      expect(getDestructiveCommandWarning('git clean -fdx')).toBe(
        'Note: may permanently delete untracked files',
      )
    })

    test('git stash drop', () => {
      expect(getDestructiveCommandWarning('git stash drop')).toBe(
        'Note: may permanently remove stashed changes',
      )
    })

    test('git stash clear', () => {
      expect(getDestructiveCommandWarning('git stash clear')).toBe(
        'Note: may permanently remove stashed changes',
      )
    })

    test('git push (normal) is safe', () => {
      expect(getDestructiveCommandWarning('git push origin main')).toBeNull()
    })

    test('git clean -n (dry-run) is safe', () => {
      expect(getDestructiveCommandWarning('git clean -n')).toBeNull()
    })

    test('git clean --dry-run is safe', () => {
      expect(getDestructiveCommandWarning('git clean --dry-run')).toBeNull()
    })
  })

  describe('database operations', () => {
    test('DROP TABLE', () => {
      expect(getDestructiveCommandWarning('DROP TABLE users')).toBe(
        'Note: may drop or truncate database objects',
      )
    })

    test('TRUNCATE TABLE', () => {
      expect(getDestructiveCommandWarning('TRUNCATE TABLE users')).toBe(
        'Note: may drop or truncate database objects',
      )
    })

    test('DROP DATABASE', () => {
      expect(getDestructiveCommandWarning('DROP DATABASE production')).toBe(
        'Note: may drop or truncate database objects',
      )
    })
  })

  describe('system operations', () => {
    test('Stop-Computer', () => {
      expect(getDestructiveCommandWarning('Stop-Computer')).toBe(
        'Note: will shut down the computer',
      )
    })

    test('Restart-Computer', () => {
      expect(getDestructiveCommandWarning('Restart-Computer')).toBe(
        'Note: will restart the computer',
      )
    })

    test('Clear-RecycleBin', () => {
      expect(getDestructiveCommandWarning('Clear-RecycleBin')).toBe(
        'Note: permanently deletes recycled files',
      )
    })
  })

  describe('safe commands', () => {
    test('Get-Process is safe', () => {
      expect(getDestructiveCommandWarning('Get-Process')).toBeNull()
    })

    test('Get-ChildItem is safe', () => {
      expect(getDestructiveCommandWarning('Get-ChildItem')).toBeNull()
    })

    test('Write-Host is safe', () => {
      expect(getDestructiveCommandWarning("Write-Host 'hello'")).toBeNull()
    })

    test('empty string is safe', () => {
      expect(getDestructiveCommandWarning('')).toBeNull()
    })
  })

  describe('piped commands', () => {
    test('Remove-Item in pipeline', () => {
      expect(
        getDestructiveCommandWarning(
          'Get-ChildItem | Remove-Item -Recurse -Force',
        ),
      ).toBe('Note: may recursively force-remove files')
    })
  })

  describe('case insensitive', () => {
    test('REMOVE-ITEM -RECURSE -FORCE', () => {
      expect(
        getDestructiveCommandWarning('REMOVE-ITEM ./x -RECURSE -FORCE'),
      ).toBe('Note: may recursively force-remove files')
    })

    test('format-volume mixed case', () => {
      expect(getDestructiveCommandWarning('Format-volume')).toBe(
        'Note: may format a disk volume',
      )
    })
  })
})
