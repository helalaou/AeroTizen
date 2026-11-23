using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace AeroTizen.Home
{
    internal static class HomeSettings
    {
        private const string MainOperation = "http://tizen.org/appcontrol/operation/main";
        private const string HomeKey = "db/appfw/home_appid";
        private const string StartupKey = "db/appfw/startup_appid";
        private const string StartupBackupKey = "db/appfw/booting_appid_backup";
        private const string FirstScreenKey = "db/first_screen/type";
        private const string AutoStartKey = "db/menu/smart_hub/ontvsetting/auto_start";
        private const int MaxAppIdCharacters = 256;
        private const int MaxOsReleaseBytes = 8192;
        private const string OsReleasePath = "/etc/os-release";
        private const string BuildIdPrefix = "BUILD_ID=";
        private static readonly Lazy<string> FirmwareBuild = new Lazy<string>(ReadFirmwareBuild);
        private static readonly Lazy<string> HelperChecksum = new Lazy<string>(ReadHelperChecksum);

        [DllImport("libc.so.6")] private static extern void free(IntPtr value);
        [DllImport("libvconf.so.0", SetLastError = true)]
        private static extern IntPtr vconf_get_str(string key);
        [DllImport("libvconf.so.0", SetLastError = true)]
        private static extern int vconf_get_int(string key, out int value);
        [DllImport("libcapi-appfw-app-operation-tv.so.0")]
        private static extern int app_operation_get_current_app(string operation, out IntPtr appId);

        private static Dictionary<string, object> Unavailable(string type, string error) =>
            new Dictionary<string, object> { ["type"] = type, ["status"] = "unavailable", ["value"] = null, ["error"] = error };

        private static Dictionary<string, object> StringValue(string key, bool operation = false)
        {
            IntPtr value = IntPtr.Zero;
            try
            {
                if (operation)
                {
                    int result = app_operation_get_current_app(key, out value);
                    if (result != 0) return Unavailable("string", "native return code " + result);
                }
                else value = vconf_get_str(key);
                if (value == IntPtr.Zero)
                    return Unavailable("string", "getter returned null; errno=" + Marshal.GetLastWin32Error());
                return new Dictionary<string, object> {
                    ["type"] = "string", ["status"] = "ok", ["value"] = Marshal.PtrToStringAnsi(value)
                };
            }
            catch (Exception error) { return Unavailable("string", error.GetType().Name + ": " + error.Message); }
            finally { if (value != IntPtr.Zero) free(value); }
        }

        private static Dictionary<string, object> IntegerValue(string key)
        {
            try
            {
                int result = vconf_get_int(key, out int value);
                if (result != 0) return Unavailable("int", "native return code " + result);
                return new Dictionary<string, object> { ["type"] = "int", ["status"] = "ok", ["value"] = value };
            }
            catch (Exception error) { return Unavailable("int", error.GetType().Name + ": " + error.Message); }
        }

        internal static Dictionary<string, object> ReadMainOperation() => StringValue(MainOperation, true);

        internal static Dictionary<string, object> ReadValues() => new Dictionary<string, object> {
            [HomeKey] = StringValue(HomeKey), [StartupKey] = StringValue(StartupKey),
            [StartupBackupKey] = StringValue(StartupBackupKey), [FirstScreenKey] = StringValue(FirstScreenKey),
            [AutoStartKey] = IntegerValue(AutoStartKey),
        };

        private static string BoundedAppId(Dictionary<string, object> field) =>
            field["value"] is string value && value.Length <= MaxAppIdCharacters ? value : null;

        private static string ReadFirmwareBuild()
        {
            try
            {
                if (new FileInfo(OsReleasePath).Length > MaxOsReleaseBytes) return null;
                foreach (string line in File.ReadLines(OsReleasePath))
                {
                    if (!line.StartsWith(BuildIdPrefix, StringComparison.Ordinal)) continue;
                    string build = line.Substring(BuildIdPrefix.Length).Trim().Trim('"', '\'');
                    return build.Length > 0 && build.Length <= MaxAppIdCharacters ? build : null;
                }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            return null;
        }

        private static string ReadHelperChecksum()
        {
            try
            {
                using (var stream = File.OpenRead(typeof(HomeSettings).Assembly.Location))
                using (var hash = SHA256.Create())
                    return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
            }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }

        internal static object ReadBridgeStatus()
        {
            var autostart = IntegerValue(AutoStartKey)["value"];
            bool? enabled = autostart is int value && (value == 0 || value == 1) ? value == 1 : (bool?)null;
            return new {
                home_button_app = BoundedAppId(ReadMainOperation()),
                home_app = BoundedAppId(StringValue(HomeKey)),
                startup_app = BoundedAppId(StringValue(StartupKey)),
                startup_backup_app = BoundedAppId(StringValue(StartupBackupKey)),
                smart_hub_autostart = enabled,
                first_screen = BoundedAppId(StringValue(FirstScreenKey)),
                firmware_build = FirmwareBuild.Value,
                helper_sha256 = HelperChecksum.Value,
            };
        }
    }
}
