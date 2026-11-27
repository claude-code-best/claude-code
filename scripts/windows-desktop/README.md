# Windows desktop client

A native x64 WinForms window embeds the RCS web UI using Microsoft Edge WebView2.
It has its own application identity and transparent icon, with no browser tabs or
address bar. External HTTP(S) links open in the default browser. Closing the window
leaves the service running; a second launch focuses the existing window.

## Install

Requires Windows 10/11 x64, .NET Framework 4.6.2 or later, PowerShell 5.1,
[WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/),
and Bun >= 1.3.0. Run from a source checkout:

```powershell
bun install
bun run --cwd packages/remote-control-server build:web
# Open the CLI once and explicitly accept trust for this checkout.
bun run dev
# Exit the CLI, then install:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-desktop/install.ps1
```

The installer downloads the pinned Microsoft.Web.WebView2 NuGet SDK 1.0.4314.35
from nuget.org, compiles with the Windows .NET Framework compiler, and installs to
`%LOCALAPPDATA%\RealAgenticDesktop`. It creates `RealAgentic.lnk` on the current
user's desktop. No administrator rights are required. The runtime itself must
already be installed; the SDK does not contain the Evergreen Runtime.

Double-click the shortcut to launch. On upstream, startup launches the loopback-only
RCS server and the `remote-control` bridge using a locally generated transport key.
On checkouts with `scripts/rcs-stack/main.ts`, it launches that local stack instead.
An already healthy server on port 3000 is reused; its existing worker configuration
is left to that server's owner. Health success confirms HTTP availability, not model
provider connectivity or worker readiness. Startup errors appear in the window;
server and worker output goes to the installation's `logs` directory.

Trust, provider authentication, and model configuration follow the normal CLI rules.
The installer never accepts trust automatically or changes sandbox settings.
Native Windows does not support the Linux/macOS Chat sandbox; use Code mode when
using a checkout that offers that distinction.

## Options

```powershell
# Supply a nonstandard Bun executable or choose another checkout:
.\scripts\windows-desktop\install.ps1 -BunPath 'C:\tools\bun.exe' -RepositoryPath 'D:\projects\claude-code'
# Embed an existing service without launching a backend:
.\scripts\windows-desktop\install.ps1 -ConnectOnly -Url 'https://rcs.example.com/code/'
# Build without installing or creating shortcuts:
.\scripts\windows-desktop\build.ps1
```

`-InstallDirectory` and `-ShortcutDirectory` allow custom destinations.
`-SkipBuild` reuses a previous build; `-NoShortcut` skips shortcut creation.
Close the desktop window before reinstalling. Re-run installation after moving
the checkout or Bun. Automatic startup currently uses port 3000; custom service
URLs require `-ConnectOnly`. No startup-at-login entry is created.

To uninstall, close the window and remove the shortcut and installation directory.
Stop any backend you started separately before removing its checkout. WebView2
cookies and local storage reside in `%LOCALAPPDATA%\RealAgenticDesktop\WebView2Profile`.
Local config, transport keys, logs, profiles, SDK files, and compiled binaries must
not be committed. The transparent PNG is a user-supplied, AI-edited logo asset;
the build generates an ICO with 16–256 pixel sizes from it.

For diagnostics, launch `RealAgentic.exe --verify`: it saves a window capture and
page/app-identity metadata beside the executable. Those files may contain private
session content and are excluded from version control.
