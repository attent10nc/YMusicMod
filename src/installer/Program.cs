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
                Process.Start(new ProcessStartInfo("cmd.exe", "/c timeout /t 3 /nobreak >nul & rmdir /s /q \"" + InstallDir + "\"") { CreateNoWindow = true, UseShellExecute = false });
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
                            if (stamp != lastStamp && settled)
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
                                        catch (Exception e)
                                        {
                                            failedFor = ver;
                                            Notify(tray, "YMusicMod", e.Message);
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
        public static readonly Color Bg = Color.FromArgb(14, 14, 18);
        public static readonly Color Card = Color.FromArgb(24, 24, 31);
        public static readonly Color CardHover = Color.FromArgb(32, 32, 41);
        public static readonly Color Line = Color.FromArgb(40, 40, 50);
        public static readonly Color Text = Color.FromArgb(242, 242, 246);
        public static readonly Color Muted = Color.FromArgb(140, 140, 155);
        public static readonly Color A1 = Color.FromArgb(255, 106, 61);
        public static readonly Color A2 = Color.FromArgb(255, 45, 122);
        public static readonly Color A3 = Color.FromArgb(139, 61, 255);
        public static readonly Color Ok = Color.FromArgb(61, 220, 132);
        public static readonly Color Warn = Color.FromArgb(255, 178, 36);

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

        public static Brush Accent(RectangleF r)
        {
            var b = new LinearGradientBrush(r, A1, A3, LinearGradientMode.Horizontal);
            var blend = new ColorBlend(3);
            blend.Colors = new[] { A1, A2, A3 };
            blend.Positions = new[] { 0f, 0.55f, 1f };
            b.InterpolationColors = blend;
            return b;
        }

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
        float shimmer;
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

            anim = new System.Windows.Forms.Timer { Interval = 16 };
            anim.Tick += (s, e) => { shimmer = (shimmer + 0.012f) % 1.6f; Invalidate(new Rectangle(0, 300, Width, 70)); };

            MouseDown += (s, e) => { if (e.Button == MouseButtons.Left && e.Y < 140) { ReleaseCapture(); SendMessage(Handle, 0xA1, 2, 0); } };
            Shown += (s, e) => AutoStart();
            Refresh2();
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
            anim.Start();
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
            anim.Stop();
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

            // свечение в шапке
            using (var path = new GraphicsPath())
            {
                path.AddEllipse(-160, -220, 620, 420);
                using (var pb = new PathGradientBrush(path))
                {
                    pb.CenterColor = Color.FromArgb(70, Theme.A2);
                    pb.SurroundColors = new[] { Color.FromArgb(0, Theme.A2) };
                    g.FillPath(pb, path);
                }
            }
            using (var path = new GraphicsPath())
            {
                path.AddEllipse(380, -260, 520, 400);
                using (var pb = new PathGradientBrush(path))
                {
                    pb.CenterColor = Color.FromArgb(45, Theme.A3);
                    pb.SurroundColors = new[] { Color.FromArgb(0, Theme.A3) };
                    g.FillPath(pb, path);
                }
            }

            g.DrawImage(logo, new Rectangle(36, 40, 76, 76));
            using (var f = Theme.F(24f, FontStyle.Regular, true)) TextRenderer.DrawText(g, "YMusicMod", f, new Point(126, 42), Theme.Text);
            using (var f = Theme.F(10.5f)) TextRenderer.DrawText(g, "Кастомизация Яндекс Музыки", f, new Point(130, 86), Theme.Muted);
            DrawChip(g, "v" + Patcher.ModVersion, new Point(316, 54));

            // карточка состояния
            var card = new RectangleF(32, 150, 616, 104);
            using (var p = Theme.Round(card, 18)) using (var b = new SolidBrush(Theme.Card)) g.FillPath(b, p);
            DrawStatusIcon(g, new RectangleF(52, 176, 52, 52));
            using (var f = Theme.F(13f, FontStyle.Regular, true)) TextRenderer.DrawText(g, title, f, new Rectangle(120, 172, 400, 28), Theme.Text, TextFormatFlags.EndEllipsis);
            using (var f = Theme.F(9.5f)) TextRenderer.DrawText(g, subtitle, f, new Rectangle(121, 201, mode == Mode.Missing ? 500 : 410, 20), Theme.Muted, TextFormatFlags.EndEllipsis);
            if (detail.Length > 0)
                using (var f = Theme.F(8.5f)) TextRenderer.DrawText(g, detail, f, new Rectangle(121, 222, 410, 18), Color.FromArgb(95, 95, 110), TextFormatFlags.PathEllipsis);

            DrawSteps(g, new RectangleF(32, 274, 616, 40));
            DrawProgress(g, new RectangleF(36, 330, 608, 6));

            using (var f = Theme.F(9.5f)) TextRenderer.DrawText(g, "Возвращать мод после обновлений", f, new Point(88, 375), Theme.Text);
        }

        void DrawChip(Graphics g, string text, Point at)
        {
            using (var f = Theme.F(8.5f, FontStyle.Regular, true))
            {
                var size = TextRenderer.MeasureText(text, f);
                var r = new RectangleF(at.X, at.Y, size.Width + 12, 22);
                using (var p = Theme.Round(r, 11)) using (var b = Theme.Accent(r)) g.FillPath(b, p);
                TextRenderer.DrawText(g, text, f, Rectangle.Round(r), Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
        }

        void DrawStatusIcon(Graphics g, RectangleF r)
        {
            Color c = mode == Mode.Done ? Theme.Ok : mode == Mode.Missing || mode == Mode.Error ? Theme.Warn : Theme.A2;
            using (var b = new SolidBrush(Color.FromArgb(38, c))) g.FillEllipse(b, r);
            using (var pen = new Pen(c, 3.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
            {
                float cx = r.X + r.Width / 2, cy = r.Y + r.Height / 2;
                if (mode == Mode.Done)
                    g.DrawLines(pen, new[] { new PointF(cx - 10, cy), new PointF(cx - 3, cy + 7), new PointF(cx + 11, cy - 8) });
                else if (mode == Mode.Missing || mode == Mode.Error)
                {
                    g.DrawLine(pen, cx, cy - 11, cx, cy + 3);
                    g.FillEllipse(new SolidBrush(c), cx - 2.2f, cy + 8, 4.4f, 4.4f);
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
                if (done) using (var b = Theme.Accent(dot)) g.FillEllipse(b, dot);
                else using (var b = new SolidBrush(active ? Theme.CardHover : Theme.Card)) g.FillEllipse(b, dot);
                if (active) using (var pen = new Pen(Theme.A2, 2f)) g.DrawEllipse(pen, dot);
                if (done)
                    using (var pen = new Pen(Color.White, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        g.DrawLines(pen, new[] { new PointF(dot.X + 6.5f, dot.Y + 11), new PointF(dot.X + 9.5f, dot.Y + 14), new PointF(dot.X + 15.5f, dot.Y + 8) });
                using (var f = Theme.F(9f, FontStyle.Regular, done || active))
                    TextRenderer.DrawText(g, steps[i], f, new Point((int)x + 32, (int)r.Y + 9), done || active ? Theme.Text : Theme.Muted);
            }
        }

        void DrawProgress(Graphics g, RectangleF r)
        {
            using (var p = Theme.Round(r, 3)) using (var b = new SolidBrush(Theme.Line)) g.FillPath(b, p);
            float frac = mode == Mode.Done ? 1f : step < 0 ? 0f : Math.Min(1f, (step + (mode == Mode.Working ? 0.5f : 0f)) / steps.Length);
            if (frac <= 0) return;
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
                if (hover) using (var p = Theme.Round(r, 8)) using (var b = new SolidBrush(Danger ? Color.FromArgb(232, 17, 35) : Theme.CardHover)) g.FillPath(b, p);
                using (var f = Theme.F(10f)) TextRenderer.DrawText(g, Glyph, f, ClientRectangle, hover ? Color.White : Theme.Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                return;
            }
            using (var p = Theme.Round(r, Kind == BtnKind.Ghost ? 10 : 14))
            {
                if (!Enabled)
                {
                    using (var b = new SolidBrush(Theme.Card)) g.FillPath(b, p);
                    fg = Color.FromArgb(90, 90, 100);
                }
                else if (Kind == BtnKind.Primary)
                {
                    using (var b = Theme.Accent(r)) g.FillPath(b, p);
                    if (hover) using (var b = new SolidBrush(Color.FromArgb(28, Color.White))) g.FillPath(b, p);
                    fg = Color.White;
                }
                else if (Kind == BtnKind.Secondary)
                {
                    using (var b = new SolidBrush(hover ? Theme.CardHover : Theme.Card)) g.FillPath(b, p);
                    using (var pen = new Pen(Theme.Line)) g.DrawPath(pen, p);
                }
                else
                {
                    if (hover) using (var b = new SolidBrush(Theme.CardHover)) g.FillPath(b, p);
                    fg = hover ? Theme.Text : Theme.A2;
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
            using (var b = new SolidBrush(Enabled ? Color.White : Color.Gray)) g.FillEllipse(b, x, r.Y + 3, d, d);
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
