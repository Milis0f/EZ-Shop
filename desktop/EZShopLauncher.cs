// EZ-Shop for Windows: starts the app's production server on this computer, opens it in its own
// window, and stops the server when the window closes. No network access beyond 127.0.0.1.
// Built by desktop/build-exe.ps1 with the C# compiler that ships with Windows (.NET Framework 4).

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

internal static class EZShopLauncher
{
    private const string Title = "EZ-Shop";
    private const int FirstPort = 3000;
    private const int LastPort = 3010;
    private static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EZ-Shop");

    [STAThread]
    private static int Main()
    {
        bool first;
        using (var single = new Mutex(true, "Local\\EZ-Shop-Launcher", out first))
        {
            Directory.CreateDirectory(DataDir);
            string portFile = Path.Combine(DataDir, "port.txt");
            // Already open: show the running app again instead of starting a second server.
            if (!first)
            {
                int running;
                if (File.Exists(portFile) && int.TryParse(File.ReadAllText(portFile).Trim(), out running) && IsUp(running))
                {
                    OpenWindow(running, false);
                    return 0;
                }
                Fail("EZ-Shop est déjà en train de démarrer. Patiente quelques secondes.");
                return 1;
            }

            string root = FindRoot();
            if (root == null)
            {
                Fail("Le dossier d'EZ-Shop est introuvable. Place EZ-Shop.exe dans le dossier du projet (à côté de package.json).");
                return 1;
            }
            string node = FindOnPath("node.exe");
            if (node == null)
            {
                Fail("Node.js est introuvable. Installe Node.js 22 (nodejs.org), puis relance EZ-Shop.");
                return 1;
            }
            string next = Path.Combine(root, "node_modules", "next", "dist", "bin", "next");
            if (!File.Exists(next))
            {
                Fail("Les dépendances d'EZ-Shop ne sont pas installées. Dans le dossier du projet, lance : npm install");
                return 1;
            }

            string log = Path.Combine(DataDir, "server.log");
            // First opening, or a new version of the code: the app is built once (a minute or two).
            if (!File.Exists(Path.Combine(root, ".next", "BUILD_ID")))
            {
                using (var notice = Notice("Première ouverture : préparation d'EZ-Shop (1 à 2 minutes)…"))
                {
                    int code = Run(node, Quote(next) + " build", root, log, true);
                    notice.Close();
                    if (code != 0)
                    {
                        Fail("La préparation d'EZ-Shop a échoué. Détails : " + log);
                        return 1;
                    }
                }
            }

            int port = FreePort();
            if (port < 0)
            {
                Fail("Aucun port libre entre 3000 et 3010 sur cet ordinateur.");
                return 1;
            }
            Process server = Start(node, Quote(next) + " start --hostname 127.0.0.1 -p " + port, root, log);
            try
            {
                if (!WaitUp(port, server, 90))
                {
                    Fail("Le serveur d'EZ-Shop n'a pas démarré. Détails : " + log);
                    return 1;
                }
                File.WriteAllText(portFile, port.ToString());
                OpenWindow(port, true);
                return 0;
            }
            finally
            {
                Stop(server);
                try { File.Delete(portFile); } catch (IOException) { }
            }
        }
    }

    /// The folder of the exe, or the one above it (when the exe sits in desktop/).
    private static string FindRoot()
    {
        string here = AppDomain.CurrentDomain.BaseDirectory;
        foreach (string candidate in new[] { here, Path.GetFullPath(Path.Combine(here, "..")) })
        {
            if (File.Exists(Path.Combine(candidate, "package.json")) && Directory.Exists(Path.Combine(candidate, "src"))) return candidate;
        }
        return null;
    }

    private static string FindOnPath(string file)
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(Path.PathSeparator))
        {
            try
            {
                string full = Path.Combine(dir.Trim().Trim('"'), file);
                if (File.Exists(full)) return full;
            }
            catch (ArgumentException) { }
        }
        string programFiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", file);
        return File.Exists(programFiles) ? programFiles : null;
    }

    private static string Quote(string value) { return "\"" + value + "\""; }

    private static ProcessStartInfo Info(string exe, string args, string dir, string log)
    {
        var info = new ProcessStartInfo(exe, args)
        {
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        info.EnvironmentVariables["NODE_ENV"] = "production";
        info.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
        return info;
    }

    private static void Pipe(Process process, string log)
    {
        var writer = TextWriter.Synchronized(new StreamWriter(log, true) { AutoFlush = true });
        writer.WriteLine("---- " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + process.StartInfo.Arguments);
        process.OutputDataReceived += (s, e) => { if (e.Data != null) writer.WriteLine(e.Data); };
        process.ErrorDataReceived += (s, e) => { if (e.Data != null) writer.WriteLine(e.Data); };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
    }

    private static int Run(string exe, string args, string dir, string log, bool wait)
    {
        Process process = Process.Start(Info(exe, args, dir, log));
        Pipe(process, log);
        while (!process.WaitForExit(200)) Application.DoEvents();
        return process.ExitCode;
    }

    private static Process Start(string exe, string args, string dir, string log)
    {
        Process process = Process.Start(Info(exe, args, dir, log));
        Pipe(process, log);
        return process;
    }

    private static bool Listening(int port)
    {
        try
        {
            using (var client = new TcpClient())
            {
                IAsyncResult attempt = client.BeginConnect(IPAddress.Loopback, port, null, null);
                return attempt.AsyncWaitHandle.WaitOne(300) && client.Connected;
            }
        }
        catch (SocketException) { return false; }
    }

    private static int FreePort()
    {
        for (int port = FirstPort; port <= LastPort; port++) if (!Listening(port)) return port;
        return -1;
    }

    private static bool IsUp(int port)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/");
            request.Timeout = 3000;
            using (var response = (HttpWebResponse)request.GetResponse()) return response.StatusCode == HttpStatusCode.OK;
        }
        catch (WebException) { return false; }
    }

    private static bool WaitUp(int port, Process server, int seconds)
    {
        using (var notice = Notice("Ouverture d'EZ-Shop…"))
        {
            DateTime until = DateTime.Now.AddSeconds(seconds);
            while (DateTime.Now < until)
            {
                if (server.HasExited) return false;
                if (IsUp(port)) { notice.Close(); return true; }
                for (int i = 0; i < 5; i++) { Application.DoEvents(); Thread.Sleep(100); }
            }
            return false;
        }
    }

    /// Edge in app mode, with its own profile so the window is a process of its own: when it closes,
    /// EZ-Shop stops. Without Edge, the default browser, and a dialog to stop EZ-Shop.
    private static void OpenWindow(int port, bool waitForClose)
    {
        string url = "http://127.0.0.1:" + port + "/";
        string edge = FindEdge();
        if (edge != null)
        {
            string profile = Path.Combine(DataDir, "Window");
            var info = new ProcessStartInfo(edge, "--app=" + url + " --user-data-dir=" + Quote(profile) + " --no-first-run --start-maximized --disable-features=Translate") { UseShellExecute = false };
            Process window = Process.Start(info);
            if (!waitForClose) return;
            window.WaitForExit();
            // Edge may hand the window to a second process of the same profile: wait for every one.
            while (ProfileRunning(profile)) Thread.Sleep(1000);
            return;
        }
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        if (waitForClose) MessageBox.Show("EZ-Shop est ouvert dans ton navigateur.\n\nClique OK pour arrêter EZ-Shop.", Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private static bool ProfileRunning(string profile)
    {
        // The profile's lock file exists while a browser process holds it.
        return File.Exists(Path.Combine(profile, "lockfile")) && IsLocked(Path.Combine(profile, "lockfile"));
    }

    private static bool IsLocked(string file)
    {
        try
        {
            using (File.Open(file, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) return false;
        }
        catch (IOException) { return true; }
        catch (UnauthorizedAccessException) { return true; }
    }

    private static string FindEdge()
    {
        string[] candidates =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
        };
        foreach (string candidate in candidates) if (File.Exists(candidate)) return candidate;
        return null;
    }

    /// Stops the server and every process it started (the AI engine runs inside it).
    private static void Stop(Process server)
    {
        if (server == null || server.HasExited) return;
        try
        {
            using (var kill = Process.Start(new ProcessStartInfo("taskkill", "/PID " + server.Id + " /T /F") { UseShellExecute = false, CreateNoWindow = true })) kill.WaitForExit(10000);
        }
        catch (Exception) { }
    }

    private static Form Notice(string text)
    {
        var form = new Form
        {
            Text = Title,
            Width = 420,
            Height = 120,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterScreen,
            ControlBox = false,
            ShowInTaskbar = true,
            TopMost = true,
        };
        form.Controls.Add(new Label { Text = text, Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter });
        form.Show();
        Application.DoEvents();
        return form;
    }

    private static void Fail(string text)
    {
        MessageBox.Show(text, Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
}
