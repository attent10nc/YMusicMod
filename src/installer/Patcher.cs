using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace YMusicMod
{
    class AsarEntry
    {
        public string Path;
        public Dictionary<string, object> Node;
        public long Offset;
        public long Size;
        public bool Unpacked;
    }

    static class Asar
    {
        static JavaScriptSerializer Json()
        {
            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            js.RecursionLimit = 1000;
            return js;
        }

        public static Dictionary<string, object> ReadHeader(string file, out long dataOffset)
        {
            using (var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var br = new BinaryReader(fs))
            {
                br.ReadUInt32();
                uint headerSize = br.ReadUInt32();
                br.ReadUInt32();
                int strLen = br.ReadInt32();
                byte[] s = br.ReadBytes(strLen);
                dataOffset = 8 + headerSize;
                return (Dictionary<string, object>)Json().DeserializeObject(Encoding.UTF8.GetString(s));
            }
        }

        public static void Collect(Dictionary<string, object> dir, string prefix, List<AsarEntry> list)
        {
            var files = (Dictionary<string, object>)dir["files"];
            foreach (var kv in files)
            {
                var n = (Dictionary<string, object>)kv.Value;
                string p = prefix.Length == 0 ? kv.Key : prefix + "/" + kv.Key;
                if (n.ContainsKey("files")) { Collect(n, p, list); continue; }
                if (n.ContainsKey("link")) continue;
                var e = new AsarEntry();
                e.Path = p;
                e.Node = n;
                e.Unpacked = n.ContainsKey("unpacked") && Convert.ToBoolean(n["unpacked"]);
                e.Size = Convert.ToInt64(n["size"]);
                if (!e.Unpacked) e.Offset = long.Parse(Convert.ToString(n["offset"]));
                list.Add(e);
            }
        }

        public static byte[] ReadFile(string archive, string path)
        {
            long dataOffset;
            var header = ReadHeader(archive, out dataOffset);
            var list = new List<AsarEntry>();
            Collect(header, "", list);
            var e = list.FirstOrDefault(x => x.Path == path);
            if (e == null || e.Unpacked) throw new FileNotFoundException(path);
            using (var fs = new FileStream(archive, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                fs.Seek(dataOffset + e.Offset, SeekOrigin.Begin);
                var buf = new byte[e.Size];
                int read = 0;
                while (read < buf.Length) { int n = fs.Read(buf, read, buf.Length - read); if (n <= 0) break; read += n; }
                return buf;
            }
        }

        public static string ReadText(string archive, string path)
        {
            return Encoding.UTF8.GetString(ReadFile(archive, path));
        }

        static Dictionary<string, object> Integrity(byte[] data)
        {
            const int block = 4 * 1024 * 1024;
            using (var sha = SHA256.Create())
            {
                var blocks = new List<object>();
                for (int i = 0; i < data.Length; i += block)
                {
                    int len = Math.Min(block, data.Length - i);
                    blocks.Add(Hex(sha.ComputeHash(data, i, len)));
                }
                if (data.Length == 0) blocks.Add(Hex(sha.ComputeHash(new byte[0])));
                var d = new Dictionary<string, object>();
                d["algorithm"] = "SHA256";
                d["hash"] = Hex(sha.ComputeHash(data));
                d["blockSize"] = block;
                d["blocks"] = blocks;
                return d;
            }
        }

        static string Hex(byte[] b)
        {
            var sb = new StringBuilder(b.Length * 2);
            foreach (var x in b) sb.Append(x.ToString("x2"));
            return sb.ToString();
        }

        public static void Rewrite(string src, string dst, Dictionary<string, byte[]> replace)
        {
            long dataOffset;
            var header = ReadHeader(src, out dataOffset);
            var list = new List<AsarEntry>();
            Collect(header, "", list);
            var packed = list.Where(e => !e.Unpacked).OrderBy(e => e.Offset).ToList();
            long cur = 0;
            foreach (var e in packed)
            {
                byte[] r;
                long size = replace.TryGetValue(e.Path, out r) ? r.Length : e.Size;
                e.Node["offset"] = cur.ToString();
                e.Node["size"] = size;
                if (r != null && e.Node.ContainsKey("integrity")) e.Node["integrity"] = Integrity(r);
                cur += size;
            }
            byte[] json = new UTF8Encoding(false).GetBytes(Json().Serialize(header));
            int pad = (4 - (json.Length % 4)) % 4;
            uint payload = (uint)(4 + json.Length + pad);
            using (var input = new FileStream(src, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var output = new FileStream(dst, FileMode.Create, FileAccess.Write))
            using (var bw = new BinaryWriter(output))
            {
                bw.Write((uint)4);
                bw.Write(payload + 4);
                bw.Write(payload);
                bw.Write(json.Length);
                bw.Write(json);
                bw.Write(new byte[pad]);
                var buf = new byte[1 << 20];
                foreach (var e in packed)
                {
                    byte[] r;
                    if (replace.TryGetValue(e.Path, out r)) { bw.Write(r); continue; }
                    input.Seek(dataOffset + e.Offset, SeekOrigin.Begin);
                    long left = e.Size;
                    while (left > 0)
                    {
                        int n = input.Read(buf, 0, (int)Math.Min(buf.Length, left));
                        if (n <= 0) throw new IOException("unexpected end of asar");
                        bw.Write(buf, 0, n);
                        left -= n;
                    }
                }
            }
        }
    }

    class PatchException : Exception
    {
        public PatchException(string m) : base(m) { }
    }

    static class Patcher
    {
        static string appDir;
        public static string AppDir { get { return appDir ?? (appDir = FindAppDir()); } }
        public static string Resources { get { return Path.Combine(AppDir, "resources"); } }
        public static string AsarPath { get { return Path.Combine(Resources, "app.asar"); } }
        public static string BakPath { get { return Path.Combine(Resources, "app.asar.bak"); } }
        public static string ModDataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "YandexMusic", "YMusicMod"); } }

        const string SettingsKey = @"Software\YMusicMod";

        static bool LooksLikeApp(string dir)
        {
            return !string.IsNullOrEmpty(dir) && File.Exists(Path.Combine(dir, "resources", "app.asar"));
        }

        // Принимает папку программы, папку resources или путь к exe.
        public static bool TrySetAppDir(string picked)
        {
            if (string.IsNullOrEmpty(picked)) return false;
            string dir = File.Exists(picked) ? Path.GetDirectoryName(picked) : picked.TrimEnd('\\', '/');
            if (string.Equals(Path.GetFileName(dir), "resources", StringComparison.OrdinalIgnoreCase)) dir = Path.GetDirectoryName(dir);
            if (!LooksLikeApp(dir)) return false;
            appDir = dir;
            using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(SettingsKey)) k.SetValue("AppDir", dir);
            return true;
        }

        public static void ForgetAppDir()
        {
            using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(SettingsKey)) k.DeleteValue("AppDir", false);
        }

        static string FindAppDir()
        {
            using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(SettingsKey))
            {
                string saved = k == null ? null : Convert.ToString(k.GetValue("AppDir"));
                if (LooksLikeApp(saved)) return saved;
            }
            string def = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "YandexMusic");
            if (LooksLikeApp(def)) return def;
            const string key = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
            foreach (var hive in new[] { Microsoft.Win32.Registry.CurrentUser, Microsoft.Win32.Registry.LocalMachine })
            {
                using (var root = hive.OpenSubKey(key))
                {
                    if (root == null) continue;
                    foreach (var name in root.GetSubKeyNames())
                    {
                        using (var k = root.OpenSubKey(name))
                        {
                            if (k == null) continue;
                            string title = Convert.ToString(k.GetValue("DisplayName"));
                            if (title.IndexOf("Яндекс Музыка", StringComparison.OrdinalIgnoreCase) < 0 && title.IndexOf("Yandex Music", StringComparison.OrdinalIgnoreCase) < 0) continue;
                            string loc = Convert.ToString(k.GetValue("InstallLocation"));
                            if (string.IsNullOrEmpty(loc))
                            {
                                string icon = Convert.ToString(k.GetValue("DisplayIcon")).Split(',')[0].Trim('"');
                                if (icon.Length > 0) loc = Path.GetDirectoryName(icon);
                            }
                            if (LooksLikeApp(loc)) return loc;
                        }
                    }
                }
            }
            return def;
        }

        public static string Res(string name)
        {
            var asm = Assembly.GetExecutingAssembly();
            using (var s = asm.GetManifestResourceStream(name))
            using (var r = new StreamReader(s, Encoding.UTF8))
                return r.ReadToEnd();
        }

        public static string ModVersion { get { return Res("version.txt").Trim(); } }

        public static string ExePath()
        {
            if (!Directory.Exists(AppDir)) return null;
            foreach (var f in Directory.GetFiles(AppDir, "*.exe"))
            {
                string n = Path.GetFileName(f);
                if (n.StartsWith("Uninstall", StringComparison.OrdinalIgnoreCase) || n.StartsWith("elevate", StringComparison.OrdinalIgnoreCase)) continue;
                return f;
            }
            return null;
        }

        public static bool Installed { get { return File.Exists(AsarPath) && ExePath() != null; } }

        static Dictionary<string, object> Package(string asar)
        {
            return (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(Asar.ReadText(asar, "package.json"));
        }

        static string VersionOf(string asar) { return Convert.ToString(Package(asar)["version"]); }

        static string EntryOf(string asar)
        {
            var pkg = Package(asar);
            string main = pkg.ContainsKey("main") ? Convert.ToString(pkg["main"]) : "index.js";
            if (main.StartsWith("./")) main = main.Substring(2);
            return main.Length == 0 ? "index.js" : main;
        }

        public static string AppVersion() { return VersionOf(AsarPath); }

        static bool IsModded(string code) { return code.Contains("YMMOD-BEGIN") || code.Contains("YMusicMod"); }

        static bool IsModdedAsar(string asar) { return IsModded(Asar.ReadText(asar, EntryOf(asar))); }

        public static string InstalledModVersion()
        {
            if (!File.Exists(AsarPath)) return null;
            string code = Asar.ReadText(AsarPath, EntryOf(AsarPath));
            var m = Regex.Match(code, "const YMM_VERSION = \"([^\"]+)\"");
            if (m.Success) return m.Groups[1].Value;
            return IsModded(code) ? "старая" : null;
        }

        public static bool NeedsPatch()
        {
            if (!Installed) return false;
            return InstalledModVersion() != ModVersion;
        }

        public static Process[] AppProcesses()
        {
            var list = new List<Process>();
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    if (p.MainModule.FileName.StartsWith(AppDir, StringComparison.OrdinalIgnoreCase)) list.Add(p);
                }
                catch { }
            }
            return list.ToArray();
        }

        public static bool AppRunning() { return AppProcesses().Length > 0; }

        public static void CloseApp()
        {
            foreach (var p in AppProcesses()) { try { p.CloseMainWindow(); } catch { } }
            Thread.Sleep(1500);
            foreach (var p in AppProcesses()) { try { p.Kill(); } catch { } }
            for (int i = 0; i < 20 && AppRunning(); i++) Thread.Sleep(250);
            Thread.Sleep(500);
        }

        public static void LaunchApp()
        {
            string exe = ExePath();
            if (exe != null) Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = AppDir });
        }

        public static void Patch(Action<string> log)
        {
            using (var m = new Mutex(false, "Global\\YMusicModPatch"))
            {
                try { m.WaitOne(60000); } catch (AbandonedMutexException) { }
                try { PatchLocked(log); }
                finally { try { m.ReleaseMutex(); } catch { } }
            }
        }

        static void PatchLocked(Action<string> log)
        {
            if (!Installed) throw new PatchException("Яндекс Музыка не найдена. Установи её с music.yandex.ru/download и повтори.");
            string version = AppVersion();
            string baseAsar;
            if (IsModdedAsar(AsarPath))
            {
                if (!File.Exists(BakPath) || IsModdedAsar(BakPath) || VersionOf(BakPath) != version)
                    throw new PatchException("Нет чистой копии этой версии. Переустанови Яндекс Музыку и повтори.");
                baseAsar = BakPath;
                log("Яндекс Музыка " + version + " (мод уже стоит — обновляю)");
            }
            else
            {
                if (File.Exists(BakPath))
                {
                    string old = VersionOf(BakPath);
                    if (old != version) { string to = BakPath + "-" + old; if (File.Exists(to)) File.Delete(to); File.Move(BakPath, to); }
                }
                File.Copy(AsarPath, BakPath, true);
                baseAsar = BakPath;
                log("Яндекс Музыка " + version + ", резервная копия сохранена");
            }

            string entry = EntryOf(baseAsar);
            string code = Asar.ReadText(baseAsar, entry);
            var pm = Regex.Match(code, "preload:\\s*[\\w$.]+\\.join\\(\\s*__dirname\\s*,\\s*[\"']([^\"']+)[\"']\\s*\\)");
            string preloadName = pm.Success ? pm.Groups[1].Value : "preload.js";
            string preload;
            try { preload = Asar.ReadText(baseAsar, preloadName); }
            catch (FileNotFoundException) { throw new PatchException("Не найден preload приложения (" + preloadName + ")."); }

            var strict = Regex.Match(code, "^\\s*[\"']use strict[\"'];?\\s*\\n");
            string head = strict.Success ? strict.Value : "";
            code = head + Res("scheme.js") + "\n" + code.Substring(head.Length) + "\n" + Res("main.js") + "\n";
            preload = preload + "\n" + Res("preload.js") + "\n";
            log("Мод встроен (" + entry + ", " + preloadName + ")");

            var utf8 = new UTF8Encoding(false);
            var repl = new Dictionary<string, byte[]>();
            repl[entry] = utf8.GetBytes(code);
            repl[preloadName] = utf8.GetBytes(preload);
            string tmp = AsarPath + ".ymmod-tmp";
            Asar.Rewrite(baseAsar, tmp, repl);
            log("Архив собран");

            Fuse.DisableAsarIntegrity(ExePath(), log);

            bool wasRunning = AppRunning();
            if (wasRunning) { log("Закрываю Яндекс Музыку…"); CloseApp(); }
            for (int i = 0; ; i++)
            {
                try { File.Copy(tmp, AsarPath, true); break; }
                catch (IOException)
                {
                    if (i >= 10) throw new PatchException("Не удалось записать app.asar — закрой Яндекс Музыку и повтори.");
                    Thread.Sleep(700);
                }
            }
            File.Delete(tmp);
            Directory.CreateDirectory(ModDataDir);
            File.WriteAllText(Path.Combine(ModDataDir, "patch-state.json"),
                "{\n  \"appVersion\": \"" + version + "\",\n  \"modVersion\": \"" + ModVersion + "\",\n  \"patchedAt\": \"" + DateTime.UtcNow.ToString("o") + "\"\n}", utf8);
            log("Готово: YMusicMod " + ModVersion + " → Яндекс Музыка " + version);
            if (wasRunning) LaunchApp();
        }

        public static void Restore(Action<string> log)
        {
            if (!File.Exists(BakPath)) throw new PatchException("Нет чистой копии app.asar.bak — мод, похоже, не установлен.");
            bool wasRunning = AppRunning();
            if (wasRunning) CloseApp();
            File.Copy(BakPath, AsarPath, true);
            log("Оригинальная Яндекс Музыка восстановлена");
            if (wasRunning) LaunchApp();
        }
    }

    static class Fuse
    {
        const string Sentinel = "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX";
        const int IntegrityIndex = 4;

        public static void DisableAsarIntegrity(string exe, Action<string> log)
        {
            byte[] data = File.ReadAllBytes(exe);
            byte[] s = Encoding.ASCII.GetBytes(Sentinel);
            int pos = IndexOf(data, s);
            if (pos < 0) { log("Fuse не найден — пропускаю"); return; }
            int wire = pos + s.Length;
            int len = data[wire + 1];
            int at = wire + 2 + IntegrityIndex;
            if (IntegrityIndex >= len || data[at] != (byte)'1') return;
            if (!File.Exists(exe + ".bak")) File.Copy(exe, exe + ".bak");
            data[at] = (byte)'0';
            bool running = Patcher.AppRunning();
            if (running) Patcher.CloseApp();
            File.WriteAllBytes(exe, data);
            log("Проверка целостности asar отключена");
        }

        static int IndexOf(byte[] hay, byte[] needle)
        {
            for (int i = 0; i <= hay.Length - needle.Length; i++)
            {
                int j = 0;
                while (j < needle.Length && hay[i + j] == needle[j]) j++;
                if (j == needle.Length) return i;
            }
            return -1;
        }
    }
}
