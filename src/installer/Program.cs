// YMusicMod.exe              окно установки (ставит мод сразу при открытии)
// YMusicMod.exe --install    тихая установка (--no-guard без фонового процесса)
// YMusicMod.exe --uninstall  удаление
// YMusicMod.exe --guard      фоновый процесс, возвращает мод после обновлений Яндекс Музыки
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace YMusicMod
{
    static class Program
    {
        public const string RepoUrl = "https://github.com/attent10nc/YMusicMod";
        public static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YMusicMod");
        public static string InstalledExe { get { return Path.Combine(InstallDir, "YMusicMod.exe"); } }
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunName = "YMusicMod";

        [STAThread]
        static int Main(string[] args)
        {
            if (args.Contains("--guard")) { Guard.Run(); return 0; }
            if (args.Contains("--install")) return Cli(() => Install(!args.Contains("--no-guard"), Console.WriteLine));
            if (args.Contains("--uninstall")) return Cli(() => Uninstall(Console.WriteLine));
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
            return 0;
        }

        static int Cli(Action a)
        {
            try { a(); return 0; }
            catch (Exception e) { Console.WriteLine(e.Message); return 1; }
        }

        public static bool IsAdmin
        {
            get { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
        }

        public static bool GuardEnabled
        {
            get { using (var k = Registry.CurrentUser.OpenSubKey(RunKey)) return k != null && k.GetValue(RunName) != null; }
        }

        public static void Install(bool guard, Action<string> log)
        {
            Directory.CreateDirectory(InstallDir);
            string self = Process.GetCurrentProcess().MainModule.FileName;
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase))
            {
                StopGuards();
                File.Copy(self, InstalledExe, true);
            }
            Patcher.Patch(log);
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (guard) k.SetValue(RunName, "\"" + InstalledExe + "\" --guard");
                else k.DeleteValue(RunName, false);
            }
            StopGuards();
            if (guard)
            {
                Process.Start(new ProcessStartInfo(InstalledExe, "--guard") { UseShellExecute = false, CreateNoWindow = true });
                log("Автовосстановление включено");
            }
            if (!Patcher.AppRunning()) Patcher.LaunchApp();
        }

        public static void Uninstall(Action<string> log)
        {
            StopGuards();
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey)) k.DeleteValue(RunName, false);
            Patcher.Restore(log);
            Patcher.ForgetAppDir();
            // Удаляем свою папку уже после выхода.
            if (Directory.Exists(InstallDir))
            {
                int me = Process.GetCurrentProcess().Id;
                string ps = "Wait-Process -Id " + me + " -ErrorAction SilentlyContinue; Start-Sleep 1; Remove-Item -LiteralPath '" + InstallDir.Replace("'", "''") + "' -Recurse -Force -ErrorAction SilentlyContinue";
                Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -WindowStyle Hidden -Command \"" + ps + "\"") { CreateNoWindow = true, UseShellExecute = false });
            }
            log("Мод удалён. Настройки и фоны остались в %APPDATA%\\YandexMusic\\YMusicMod");
        }

        public static void StopGuards()
        {
            int me = Process.GetCurrentProcess().Id;
            foreach (var p in Process.GetProcessesByName("YMusicMod"))
            {
                if (p.Id == me) continue;
                try { p.Kill(); p.WaitForExit(2000); } catch { }
            }
        }

        // Яндекс Музыка установлена для всех пользователей — нужен перезапуск от имени администратора.
        public static bool RunElevated(string args)
        {
            try
            {
                var p = Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, args) { Verb = "runas", UseShellExecute = true });
                p.WaitForExit();
                return p.ExitCode == 0;
            }
            catch { return false; }
        }

        public static Image Logo()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                return Image.FromStream(s);
        }
    }

    static class Guard
    {
        public static void Run()
        {
            bool created;
            using (var single = new Mutex(true, "Local\\YMusicModGuard", out created))
            {
                if (!created) return;
                var tray = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Process.GetCurrentProcess().MainModule.FileName), Text = "YMusicMod", Visible = false };
                string lastStamp = null, failedFor = null;
                while (true)
                {
                    try
                    {
                        if (File.Exists(Patcher.AsarPath))
                        {
                            var fi = new FileInfo(Patcher.AsarPath);
                            string stamp = fi.Length + ":" + fi.LastWriteTimeUtc.Ticks;
                            bool settled = (DateTime.UtcNow - fi.LastWriteTimeUtc).TotalSeconds > 20;
                            if (stamp != lastStamp && settled && !UpdaterRunning())
                            {
                                if (Patcher.NeedsPatch())
                                {
                                    string ver = Patcher.AppVersion();
                                    if (failedFor != ver)
                                    {
                                        try
                                        {
                                            Patcher.Patch(s => { });
                                            Notify(tray, "Мод снова на месте", "Яндекс Музыка обновилась до " + ver + ", YMusicMod восстановлен.");
                                        }
                                        catch (PatchException e)
                                        {
                                            // несовместимая версия - не долбим каждые 15 секунд
                                            failedFor = ver;
                                            Notify(tray, "YMusicMod", e.Message);
                                        }
                                        catch
                                        {
                                            // файл занят и т.п. - попробуем на следующем круге
                                            Thread.Sleep(15000);
                                            continue;
                                        }
                                    }
                                }
                                fi.Refresh();
                                lastStamp = fi.Length + ":" + fi.LastWriteTimeUtc.Ticks;
                            }
                        }
                    }
                    catch { }
                    Thread.Sleep(15000);
                }
            }
        }

        // Пока работает установщик обновления, файлы приложения трогать нельзя.
        static bool UpdaterRunning()
        {
            string updater = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "yandexmusic-updater");
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    string n = p.ProcessName;
                    if (n.StartsWith("Yandex_Music", StringComparison.OrdinalIgnoreCase) || n.StartsWith("Uninstall", StringComparison.OrdinalIgnoreCase) && p.MainModule.FileName.StartsWith(Patcher.AppDir, StringComparison.OrdinalIgnoreCase))
                        return true;
                    if (p.MainModule.FileName.StartsWith(updater, StringComparison.OrdinalIgnoreCase)) return true;
                }
                catch { }
            }
            return false;
        }

        static void Notify(NotifyIcon tray, string title, string text)
        {
            tray.Visible = true;
            tray.ShowBalloonTip(6000, title, text, ToolTipIcon.Info);
            var t = new Thread(() => { Thread.Sleep(8000); tray.Visible = false; });
            t.IsBackground = true;
            t.Start();
        }
    }

    static class Theme
    {
        public static readonly Color Bg = Color.Black;
        public static readonly Color Card = Color.FromArgb(17, 17, 17);
        public static readonly Color CardHover = Color.FromArgb(34, 34, 34);
        public static readonly Color Line = Color.FromArgb(44, 44, 44);
        public static readonly Color Text = Color.White;
        public static readonly Color Muted = Color.FromArgb(146, 146, 146);

        public static Font F(float size, FontStyle style = FontStyle.Regular, bool semibold = false)
        {
            return new Font(semibold ? "Segoe UI Semibold" : "Segoe UI", size, style, GraphicsUnit.Point);
        }

        public static GraphicsPath Round(RectangleF r, float radius)
        {
            var p = new GraphicsPath();
            float d = radius * 2;
            if (d <= 0) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static Brush Accent(RectangleF r) { return new SolidBrush(Color.White); }

        public static void Hq(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        }
    }

    // Всё окно рисуется вручную, кроме кнопок-контролов.
    class SetupForm : Form
    {
        [DllImport("Gdi32.dll")]
        static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int h);
        [DllImport("user32.dll")]
        static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        static extern IntPtr SendMessage(IntPtr h, int msg, int w, int l);

        enum Mode { Ready, Working, Done, Missing, Error }

        readonly Image logo;
        readonly string[] steps = { "Поиск", "Резервная копия", "Встраивание", "Запуск" };
        int step = -1;
        Mode mode;
        string title = "", subtitle = "", detail = "";
        float shimmer, phase, energy = 0.3f, shownFrac, checkT;
        readonly System.Windows.Forms.Timer anim;

        readonly Btn primary, secondary, changeDir, minBtn, closeBtn;
        readonly Toggle guard;
        readonly LinkBtn settingsLink, repoLink;

        public SetupForm()
        {
            Text = "YMusicMod";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(680, 470);
            BackColor = Theme.Bg;
            DoubleBuffered = true;
            Font = Theme.F(10f);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            Region = Region.FromHrgn(CreateRoundRectRgn(0, 0, Width + 1, Height + 1, 24, 24));
            logo = Program.Logo();

            minBtn = new Btn { Kind = BtnKind.Window, Glyph = "—", Bounds = new Rectangle(596, 14, 32, 28) };
            closeBtn = new Btn { Kind = BtnKind.Window, Glyph = "✕", Bounds = new Rectangle(632, 14, 32, 28), Danger = true };
            minBtn.Click += (s, e) => WindowState = FormWindowState.Minimized;
            closeBtn.Click += (s, e) => Close();

            changeDir = new Btn { Kind = BtnKind.Ghost, Text = "Изменить", Bounds = new Rectangle(536, 186, 96, 32) };
            changeDir.Click += (s, e) => PickFolder();

            guard = new Toggle { Bounds = new Rectangle(36, 372, 44, 24), Checked = Program.GuardEnabled || !File.Exists(Patcher.BakPath) };
            primary = new Btn { Kind = BtnKind.Primary, Bounds = new Rectangle(36, 410, 400, 46) };
            secondary = new Btn { Kind = BtnKind.Secondary, Bounds = new Rectangle(448, 410, 196, 46) };
            primary.Click += (s, e) => OnPrimary();
            secondary.Click += (s, e) => OnSecondary();

            settingsLink = new LinkBtn { Text = "Папка настроек", Bounds = new Rectangle(452, 372, 110, 24) };
            repoLink = new LinkBtn { Text = "GitHub", Bounds = new Rectangle(580, 372, 64, 24) };
            settingsLink.Click += (s, e) => { Directory.CreateDirectory(Patcher.ModDataDir); Process.Start("explorer.exe", Patcher.ModDataDir); };
            repoLink.Click += (s, e) => Process.Start(Program.RepoUrl);

            Controls.AddRange(new Control[] { minBtn, closeBtn, changeDir, guard, primary, secondary, settingsLink, repoLink });

            // Волна в шапке живёт всё время, пока окно открыто. Во время установки она оживает.
            anim = new System.Windows.Forms.Timer { Interval = 16 };
            anim.Tick += (s, e) => Animate();
            Opacity = 0;

            MouseDown += (s, e) => { if (e.Button == MouseButtons.Left && e.Y < 140) { ReleaseCapture(); SendMessage(Handle, 0xA1, 2, 0); } };
            Shown += (s, e) => { anim.Start(); AutoStart(); };
            FormClosed += (s, e) => anim.Stop();
            Refresh2();
        }

        void Animate()
        {
            if (WindowState == FormWindowState.Minimized) return;
            if (Opacity < 1) Opacity = Math.Min(1, Opacity + 0.07);
            bool working = mode == Mode.Working;
            shimmer = (shimmer + 0.012f) % 1.6f;
            phase += working ? 0.05f : 0.018f;
            energy += ((working ? 1f : mode == Mode.Done ? 0.5f : 0.3f) - energy) * 0.04f;
            float frac = mode == Mode.Done ? 1f : step < 0 ? 0f : Math.Min(1f, (step + (working ? 0.5f : 0f)) / steps.Length);
            shownFrac += (frac - shownFrac) * 0.09f;
            checkT = mode == Mode.Done ? Math.Min(1f, checkT + 0.05f) : 0f;
            Invalidate(new Rectangle(WaveLeft, 0, Width - WaveLeft, 140), true);
            Invalidate(new Rectangle(30, 170, 90, 70));
            Invalidate(new Rectangle(30, 325, Width - 60, 16));
        }

        protected override CreateParams CreateParams
        {
            get { var cp = base.CreateParams; cp.ClassStyle |= 0x20000; return cp; } // тень окна
        }

        void AutoStart()
        {
            if (mode != Mode.Ready) return;
            string mod = null;
            try { mod = Patcher.InstalledModVersion(); } catch { }
            if (mod != Patcher.ModVersion) Run(true);
        }

        void Refresh2()
        {
            step = -1;
            if (!Patcher.Installed)
            {
                mode = Mode.Missing;
                title = "Яндекс Музыка не найдена";
                subtitle = "Укажите папку с программой или установите её";
                detail = "";
                primary.Text = "Указать папку…";
                secondary.Text = "Скачать";
                secondary.Enabled = true;
                changeDir.Visible = false;
                Invalidate();
                return;
            }
            string mod = null, app = "?";
            try { app = Patcher.AppVersion(); mod = Patcher.InstalledModVersion(); } catch { }
            changeDir.Visible = true;
            detail = Pretty(Patcher.AppDir);
            mode = Mode.Ready;
            if (mod == Patcher.ModVersion)
            {
                mode = Mode.Done;
                step = steps.Length;
                title = "Мод установлен";
                subtitle = "Яндекс Музыка " + app + " · панель: Ctrl+Shift+Y";
                primary.Text = "Переустановить";
            }
            else if (mod != null)
            {
                title = "Доступно обновление мода";
                subtitle = "Яндекс Музыка " + app + " · установлена версия " + mod;
                primary.Text = "Обновить до " + Patcher.ModVersion;
            }
            else
            {
                title = "Готово к установке";
                subtitle = "Яндекс Музыка " + app + (Patcher.AppRunning() ? " · будет перезапущена" : "");
                primary.Text = "Установить";
            }
            secondary.Text = "Удалить";
            secondary.Enabled = mod != null;
            Invalidate();
        }

        static string Pretty(string path)
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (path.StartsWith(local, StringComparison.OrdinalIgnoreCase)) return "%LOCALAPPDATA%" + path.Substring(local.Length);
            return path;
        }

        void OnPrimary()
        {
            if (mode == Mode.Missing) PickFolder();
            else Run(true);
        }

        void OnSecondary()
        {
            if (mode == Mode.Missing) Process.Start("https://music.yandex.ru/download/");
            else Run(false);
        }

        void PickFolder()
        {
            using (var dlg = new FolderBrowserDialog { Description = "Папка, где установлена Яндекс Музыка (в ней есть папка resources)", ShowNewFolderButton = false })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                if (!Patcher.TrySetAppDir(dlg.SelectedPath))
                {
                    mode = Mode.Missing;
                    title = "Это не папка Яндекс Музыки";
                    subtitle = "Нужна папка, внутри которой лежит resources\\app.asar";
                    Invalidate();
                    return;
                }
                Refresh2();
                AutoStart();
            }
        }

        void Run(bool install)
        {
            mode = Mode.Working;
            step = 0;
            title = install ? "Устанавливаю…" : "Удаляю…";
            subtitle = "Пара секунд";
            primary.Enabled = secondary.Enabled = changeDir.Enabled = guard.Enabled = false;
            Invalidate();
            bool g = guard.Checked;
            var t = new Thread(() =>
            {
                string error = null;
                try
                {
                    if (install) Program.Install(g, OnLog);
                    else Program.Uninstall(OnLog);
                }
                catch (UnauthorizedAccessException)
                {
                    if (Program.IsAdmin || !Program.RunElevated(install ? (g ? "--install" : "--install --no-guard") : "--uninstall"))
                        error = "Нет доступа к папке программы. Запустите установщик от имени администратора.";
                }
                catch (Exception e) { error = e.Message; }
                BeginInvoke(new Action(() => Finish(install, error)));
            });
            t.IsBackground = true;
            t.Start();
        }

        void OnLog(string s)
        {
            int next = step;
            string l = s.ToLowerInvariant();
            if (l.Contains("резервн") || l.Contains("обновляю")) next = 1;
            if (l.Contains("встроен")) next = 2;
            if (l.Contains("готово") || l.Contains("архив")) next = 3;
            BeginInvoke(new Action(() => { step = Math.Max(step, next); subtitle = s; Invalidate(); }));
        }

        void Finish(bool install, string error)
        {
            primary.Enabled = changeDir.Enabled = guard.Enabled = true;
            if (error != null)
            {
                mode = Mode.Error;
                title = "Не получилось";
                subtitle = error;
                primary.Text = "Повторить";
                secondary.Enabled = true;
                Invalidate();
                return;
            }
            Refresh2();
            if (!install) { title = "Мод удалён"; subtitle = "Яндекс Музыка вернулась к исходному виду"; step = -1; Invalidate(); }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);

            DrawWave(g);

            g.DrawImage(logo, new Rectangle(36, 40, 76, 76));
            using (var f = Theme.F(24f, FontStyle.Regular, true)) TextRenderer.DrawText(g, "YMusicMod", f, new Point(126, 42), Theme.Text);
            using (var f = Theme.F(10.5f)) TextRenderer.DrawText(g, "Кастомизация Яндекс Музыки", f, new Point(130, 86), Theme.Muted);
            DrawChip(g, "v" + Patcher.ModVersion, new Point(316, 54));
            using (var pen = new Pen(Theme.Line)) g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);

            // карточка состояния
            var card = new RectangleF(32, 150, 616, 104);
            using (var p = Theme.Round(card, 18))
            {
                using (var b = new SolidBrush(Theme.Card)) g.FillPath(b, p);
                using (var pen = new Pen(Theme.Line)) g.DrawPath(pen, p);
            }
            DrawStatusIcon(g, new RectangleF(52, 176, 52, 52));
            using (var f = Theme.F(13f, FontStyle.Regular, true)) TextRenderer.DrawText(g, title, f, new Rectangle(120, 172, 400, 28), Theme.Text, TextFormatFlags.EndEllipsis);
            using (var f = Theme.F(9.5f)) TextRenderer.DrawText(g, subtitle, f, new Rectangle(121, 201, mode == Mode.Missing ? 500 : 410, 20), Theme.Muted, TextFormatFlags.EndEllipsis);
            if (detail.Length > 0)
                using (var f = Theme.F(8.5f)) TextRenderer.DrawText(g, detail, f, new Rectangle(121, 222, 410, 18), Color.FromArgb(100, 100, 100), TextFormatFlags.PathEllipsis);

            DrawSteps(g, new RectangleF(32, 274, 616, 40));
            DrawProgress(g, new RectangleF(36, 330, 608, 6));

            using (var f = Theme.F(9.5f)) TextRenderer.DrawText(g, "Возвращать мод после обновлений", f, new Point(88, 375), Theme.Text);
        }

        const int WaveLeft = 400;

        // Те же ленты, что и в визуализаторе мода: сумма синусов с затуханием к краям.
        void DrawWave(Graphics g)
        {
            float w = Width - WaveLeft;
            var pts = new PointF[56];
            int[] alpha = { 34, 66, 200 };
            float[] width = { 1f, 1.2f, 1.7f };
            for (int l = 0; l < 3; l++)
            {
                for (int i = 0; i < pts.Length; i++)
                {
                    float t = i / (float)(pts.Length - 1);
                    double env = Math.Pow(Math.Sin(Math.PI * t), 1.6);
                    double a = t * 9 + phase * (1.1 + l * 0.35) + l * 1.7;
                    double y = Math.Sin(a) * 0.55 + Math.Sin(a * 2.3 - phase * 0.8) * 0.3 + Math.Sin(a * 0.45 + phase * 0.5) * 0.3;
                    pts[i] = new PointF(WaveLeft + t * w, 78 + (float)(y * env * (10 + energy * 34) * (1 - l * 0.12)));
                }
                using (var pen = new Pen(Color.FromArgb(alpha[l], Color.White), width[l]) { LineJoin = LineJoin.Round }) g.DrawCurve(pen, pts, 0.5f);
            }
        }

        void DrawChip(Graphics g, string text, Point at)
        {
            using (var f = Theme.F(8.5f, FontStyle.Regular, true))
            {
                var size = TextRenderer.MeasureText(text, f);
                var r = new RectangleF(at.X, at.Y, size.Width + 12, 22);
                using (var p = Theme.Round(r, 11)) using (var pen = new Pen(Theme.Line)) g.DrawPath(pen, p);
                TextRenderer.DrawText(g, text, f, Rectangle.Round(r), Theme.Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
        }

        void DrawStatusIcon(Graphics g, RectangleF r)
        {
            bool done = mode == Mode.Done;
            float cx = r.X + r.Width / 2, cy = r.Y + r.Height / 2;
            if (done) using (var b = new SolidBrush(Color.White)) g.FillEllipse(b, r);
            else using (var pen = new Pen(Theme.Line, 1.5f)) g.DrawEllipse(pen, r);
            using (var pen = new Pen(done ? Color.Black : Color.White, 3.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
            {
                if (done)
                {
                    // Галочка дорисовывается за несколько кадров.
                    var a = new PointF(cx - 10, cy);
                    var b = new PointF(cx - 3, cy + 7);
                    var c = new PointF(cx + 11, cy - 8);
                    float k = checkT * checkT * (3 - 2 * checkT);
                    if (k < 0.33f)
                    {
                        float q = k / 0.33f;
                        if (q > 0.01f) g.DrawLine(pen, a, new PointF(a.X + (b.X - a.X) * q, a.Y + (b.Y - a.Y) * q));
                    }
                    else
                    {
                        float q = (k - 0.33f) / 0.67f;
                        g.DrawLines(pen, new[] { a, b, new PointF(b.X + (c.X - b.X) * q, b.Y + (c.Y - b.Y) * q) });
                    }
                }
                else if (mode == Mode.Missing || mode == Mode.Error)
                {
                    g.DrawLine(pen, cx, cy - 11, cx, cy + 3);
                    using (var dot = new SolidBrush(Color.White)) g.FillEllipse(dot, cx - 2.2f, cy + 8, 4.4f, 4.4f);
                }
                else if (mode == Mode.Working)
                {
                    float a = shimmer / 1.6f * 360f;
                    g.DrawArc(pen, cx - 12, cy - 12, 24, 24, a, 260);
                }
                else
                {
                    g.DrawLine(pen, cx, cy - 11, cx, cy + 7);
                    g.DrawLines(pen, new[] { new PointF(cx - 8, cy), new PointF(cx, cy + 8), new PointF(cx + 8, cy) });
                }
            }
        }

        void DrawSteps(Graphics g, RectangleF r)
        {
            float w = r.Width / steps.Length;
            for (int i = 0; i < steps.Length; i++)
            {
                float x = r.X + i * w;
                var dot = new RectangleF(x + 4, r.Y + 8, 22, 22);
                bool done = i < step || mode == Mode.Done;
                bool active = i == step && mode == Mode.Working;
                if (done) using (var b = new SolidBrush(Color.White)) g.FillEllipse(b, dot);
                else using (var pen = new Pen(active ? Color.White : Theme.Line, active ? 2f : 1.3f)) g.DrawEllipse(pen, dot);
                if (done)
                    using (var pen = new Pen(Color.Black, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        g.DrawLines(pen, new[] { new PointF(dot.X + 6.5f, dot.Y + 11), new PointF(dot.X + 9.5f, dot.Y + 14), new PointF(dot.X + 15.5f, dot.Y + 8) });
                using (var f = Theme.F(9f, FontStyle.Regular, done || active))
                    TextRenderer.DrawText(g, steps[i], f, new Point((int)x + 32, (int)r.Y + 9), done || active ? Theme.Text : Theme.Muted);
            }
        }

        void DrawProgress(Graphics g, RectangleF r)
        {
            using (var p = Theme.Round(r, 3)) using (var b = new SolidBrush(Theme.Line)) g.FillPath(b, p);
            float frac = shownFrac;
            if (frac <= 0.003f) return;
            var fill = new RectangleF(r.X, r.Y, r.Width * frac, r.Height);
            using (var p = Theme.Round(fill, 3))
            {
                using (var b = Theme.Accent(r)) g.FillPath(b, p);
                if (mode == Mode.Working)
                {
                    float sx = r.X + (shimmer - 0.3f) * r.Width;
                    var sr = new RectangleF(sx, r.Y, r.Width * 0.3f, r.Height);
                    using (var sb = new LinearGradientBrush(new RectangleF(sx - 1, r.Y, sr.Width + 2, r.Height), Color.FromArgb(0, Color.White), Color.FromArgb(0, Color.White), 0f))
                    {
                        var blend = new ColorBlend(3);
                        blend.Colors = new[] { Color.FromArgb(0, Color.White), Color.FromArgb(150, Color.White), Color.FromArgb(0, Color.White) };
                        blend.Positions = new[] { 0f, 0.5f, 1f };
                        sb.InterpolationColors = blend;
                        g.SetClip(p);
                        g.FillRectangle(sb, sr);
                        g.ResetClip();
                    }
                }
            }
        }
    }

    enum BtnKind { Primary, Secondary, Ghost, Window }

    class Btn : Control
    {
        public BtnKind Kind;
        public string Glyph;
        public bool Danger;
        bool hover, down;

        public Btn()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor | ControlStyles.ResizeRedraw, true);
            Cursor = Cursors.Hand;
            BackColor = Color.Transparent;
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            if (down) r.Inflate(-1, -1);
            Color fg = Theme.Text;
            if (Kind == BtnKind.Window)
            {
                if (hover) using (var p = Theme.Round(r, 8)) using (var b = new SolidBrush(Danger ? Color.White : Theme.CardHover)) g.FillPath(b, p);
                using (var f = Theme.F(10f)) TextRenderer.DrawText(g, Glyph, f, ClientRectangle, hover ? (Danger ? Color.Black : Color.White) : Theme.Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                return;
            }
            using (var p = Theme.Round(r, Kind == BtnKind.Ghost ? 10 : 14))
            {
                if (!Enabled)
                {
                    using (var b = new SolidBrush(Theme.Card)) g.FillPath(b, p);
                    fg = Color.FromArgb(92, 92, 92);
                }
                else if (Kind == BtnKind.Primary)
                {
                    using (var b = Theme.Accent(r)) g.FillPath(b, p);
                    if (hover) using (var b = new SolidBrush(Color.FromArgb(38, Color.Black))) g.FillPath(b, p);
                    fg = Color.Black;
                }
                else if (Kind == BtnKind.Secondary)
                {
                    using (var b = new SolidBrush(hover ? Theme.CardHover : Theme.Card)) g.FillPath(b, p);
                    using (var pen = new Pen(Theme.Line)) g.DrawPath(pen, p);
                }
                else
                {
                    if (hover) using (var b = new SolidBrush(Theme.CardHover)) g.FillPath(b, p);
                    fg = hover ? Theme.Text : Theme.Muted;
                }
            }
            using (var f = Theme.F(Kind == BtnKind.Ghost ? 9.5f : 11f, FontStyle.Regular, true))
                TextRenderer.DrawText(g, Text, f, ClientRectangle, fg, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    class Toggle : Control
    {
        bool on;
        float knob;
        readonly System.Windows.Forms.Timer t = new System.Windows.Forms.Timer { Interval = 15 };

        public bool Checked
        {
            get { return on; }
            set { on = value; knob = value ? 1 : 0; Invalidate(); }
        }

        public Toggle()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
            t.Tick += (s, e) =>
            {
                float target = on ? 1 : 0;
                knob += (target - knob) * 0.3f;
                if (Math.Abs(target - knob) < 0.01f) { knob = target; t.Stop(); }
                Invalidate();
            };
        }

        protected override void OnClick(EventArgs e)
        {
            if (!Enabled) return;
            on = !on;
            t.Start();
            base.OnClick(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var p = Theme.Round(r, r.Height / 2))
            {
                using (var b = new SolidBrush(Theme.Line)) g.FillPath(b, p);
                if (knob > 0.01f)
                    using (var b = Theme.Accent(r))
                    {
                        var old = g.Save();
                        g.SetClip(p);
                        g.FillRectangle(b, new RectangleF(r.X, r.Y, r.Width * Math.Max(knob, 0.5f), r.Height));
                        g.Restore(old);
                        if (knob < 1f) using (var fade = new SolidBrush(Color.FromArgb((int)((1 - knob) * 255), Theme.Line))) g.FillPath(fade, p);
                    }
            }
            float d = r.Height - 6;
            float x = r.X + 3 + (r.Width - d - 6) * knob;
            using (var b = new SolidBrush(!Enabled ? Color.Gray : knob > 0.5f ? Color.Black : Color.White)) g.FillEllipse(b, x, r.Y + 3, d, d);
        }
    }

    class LinkBtn : Control
    {
        bool hover;
        public LinkBtn()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
        }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnPaint(PaintEventArgs e)
        {
            Theme.Hq(e.Graphics);
            using (var f = Theme.F(9.5f, hover ? FontStyle.Underline : FontStyle.Regular))
                TextRenderer.DrawText(e.Graphics, Text, f, ClientRectangle, hover ? Theme.Text : Theme.Muted, TextFormatFlags.Right | TextFormatFlags.VerticalCenter);
        }
    }
}
