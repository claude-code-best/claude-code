using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("RealAgentic")]
[assembly: System.Reflection.AssemblyProduct("RealAgentic Desktop")]

internal static class Program
{
    internal const string AppId = "RealAgentic.Desktop";
    internal static string Home;
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SetCurrentProcessExplicitAppUserModelID(string id);
    [DllImport("shell32.dll")] private static extern int GetCurrentProcessExplicitAppUserModelID(out IntPtr id);
    internal static string AppliedAppId { get; private set; }
    [DllImport("user32.dll")] private static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    [STAThread]
    private static void Main(string[] args)
    {
        try {
            var json = File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "desktop-config.json"));
            var config = new JavaScriptSerializer().Deserialize<DesktopConfig>(json);
            var url = new Uri(config.Url);
            if (url.Scheme != "https" && !(url.Scheme == "http" && url.IsLoopback))
                throw new InvalidOperationException("Use HTTPS or a local loopback URL.");
            Home = url.AbsoluteUri;
        } catch (Exception ex) {
            MessageBox.Show(ex.Message, "RealAgentic configuration", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(AppId));
        IntPtr id;
        Marshal.ThrowExceptionForHR(GetCurrentProcessExplicitAppUserModelID(out id));
        try { AppliedAppId = Marshal.PtrToStringUni(id); } finally { Marshal.FreeCoTaskMem(id); }
        using (var mutex = new Mutex(false, "Local\\RealAgenticDesktopWindow"))
        {
            bool acquired;
            try { acquired = mutex.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
            if (!acquired)
            {
                var previous = FindWindow(null, "RealAgentic");
                if (previous != IntPtr.Zero) { ShowWindow(previous, 9); SetForegroundWindow(previous); }
                return;
            }
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainWindow(Array.IndexOf(args, "--verify") >= 0));
            }
            finally { mutex.ReleaseMutex(); }
        }
    }
}

internal sealed class MainWindow : Form
{
    private readonly string appDirectory = AppDomain.CurrentDomain.BaseDirectory;
    private readonly bool verify;
    private readonly Label status;
    private readonly WebView2 view;
    private readonly Panel loading;
    private bool verificationStarted;
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    public MainWindow(bool verify)
    {
        this.verify = verify;
        Text = "RealAgentic";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1380, 900);
        MinimumSize = new Size(950, 640);
        WindowState = FormWindowState.Maximized;
        BackColor = Color.FromArgb(25, 24, 23);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        loading = new Panel { Dock = DockStyle.Fill, BackColor = BackColor };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5 };
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 45));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 55));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 55));
        var logo = new PictureBox { Image = Image.FromFile(Path.Combine(appDirectory, "RealAgentic.png")), SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Fill };
        var title = new Label { Text = "RealAgentic", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.White, Font = new Font("Segoe UI", 23, FontStyle.Bold) };
        status = new Label { Text = "正在启动本地服务…", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.Silver, Font = new Font("Microsoft YaHei UI", 11) };
        layout.Controls.Add(logo, 0, 1);
        layout.Controls.Add(title, 0, 2);
        layout.Controls.Add(status, 0, 3);
        loading.Controls.Add(layout);
        view = new WebView2 { Dock = DockStyle.Fill, Visible = false, DefaultBackgroundColor = BackColor };
        Controls.Add(view);
        Controls.Add(loading);
        Shown += async delegate { await InitializeAsync(); };
        FormClosed += delegate { view.Dispose(); logo.Image.Dispose(); };
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try { int dark = 1; DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int)); } catch { }
    }

    private async Task InitializeAsync()
    {
        try
        {
            await StartBackendAsync();
            if (IsDisposed) return;
            status.Text = "正在打开工作区…";
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RealAgenticDesktop", "WebView2Profile");
            var environment = await CoreWebView2Environment.CreateAsync(null, profile, null);
            await view.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
            view.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) {
                e.Handled = true;
                OpenExternal(e.Uri);
            };
            view.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
                Uri uri;
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https") && !IsLocal(uri))
                {
                    e.Cancel = true;
                    OpenExternal(e.Uri);
                }
            };
            view.CoreWebView2.NavigationCompleted += async delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
                if (!e.IsSuccess) { status.Text = "页面加载失败：" + e.WebErrorStatus; return; }
                loading.Visible = false;
                view.Visible = true;
                view.BringToFront();
                view.Focus();
                if (verify && !verificationStarted)
                {
                    verificationStarted = true;
                    await VerifyAsync();
                }
            };
            view.CoreWebView2.Navigate(Program.Home);
        }
        catch (Exception ex)
        {
            if (IsDisposed) return;
            status.Text = "启动失败，请查看提示。";
            File.WriteAllText(Path.Combine(appDirectory, "desktop-error.log"), ex.ToString());
            MessageBox.Show(this, ex.Message, "RealAgentic 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task StartBackendAsync()
    {
        var script = Path.Combine(appDirectory, "start.ps1");
        if (!File.Exists(script)) throw new FileNotFoundException("找不到服务启动脚本", script);
        var executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        var info = new ProcessStartInfo(executable, "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\" -NoBrowser") {
            UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = appDirectory,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        using (var process = Process.Start(info))
        {
            var output = process.StandardOutput.ReadToEndAsync();
            var errors = process.StandardError.ReadToEndAsync();
            var exited = Task.Run(() => process.WaitForExit());
            if (await Task.WhenAny(exited, Task.Delay(115000)) != exited) throw new TimeoutException("服务启动超时，请检查 logs 文件夹。");
            var stdout = await output;
            var stderr = await errors;
            if (process.ExitCode != 0) throw new InvalidOperationException("本地服务启动失败：\n" + stderr + "\n" + stdout);
        }
    }

    private static bool IsLocal(Uri uri) { return uri.GetLeftPart(UriPartial.Authority) == new Uri(Program.Home).GetLeftPart(UriPartial.Authority); }
    private static void OpenExternal(string target)
    {
        Uri uri;
        if (Uri.TryCreate(target, UriKind.Absolute, out uri) && (uri.Scheme == "https" || uri.Scheme == "http"))
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }

    private async Task VerifyAsync()
    {
        try
        {
            await Task.Delay(3000);
            if (IsDisposed) return;
            var result = await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({url:location.href,root:!!document.getElementById('root'),textLength:document.body.innerText.length})");
            var serializer = new JavaScriptSerializer();
            var page = serializer.Deserialize<string>(result);
            using (var output = File.Create(Path.Combine(appDirectory, "desktop-preview.png")))
                await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, output);
            File.WriteAllText(Path.Combine(appDirectory, "desktop-verification.json"), serializer.Serialize(new { title = Text, nativeWindow = Handle.ToInt64(), appId = Program.AppliedAppId, browserAddressBar = false, page = serializer.DeserializeObject(page), screenshot = "desktop-preview.png" }));
        }
        catch (Exception ex) { File.WriteAllText(Path.Combine(appDirectory, "desktop-verification-error.log"), ex.ToString()); }
    }
}

internal sealed class DesktopConfig
{
    public string Url { get; set; }
}
