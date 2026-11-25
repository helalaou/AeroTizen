// Read-only installation checks shared by the query and writer.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace AeroTizen.Home
{
    public static class Installation
    {
        internal const string LauncherAppId = "DclHome001.Home";
        internal const string AppContextLibrary = "libapp-context-manager-common.so";
        private const string LauncherPackageDirectory = "/opt/usr/apps/DclHome001";
        // Samsung TizenFX Interop.ApplicationManager.ErrorCode.NoSuchApp.
        private const int NoSuchApp = -0x01110000 | 0x01;
        [DllImport("libcapi-appfw-app-manager.so.0")]
        private static extern int app_manager_get_app_info(string appId, out IntPtr info);
        [DllImport("libcapi-appfw-app-manager.so.0")]
        private static extern int app_info_destroy(IntPtr info);
        [DllImport(AppContextLibrary)]
        private static extern byte util_is_appbooting_supported_webapp_byappid(string appId);

        private static bool PackageDirectoryVisible() => Directory.Exists(LauncherPackageDirectory);
        private static byte BootEligibility() => util_is_appbooting_supported_webapp_byappid(LauncherAppId);

        public static bool Eligible() => PackageDirectoryVisible() && BootEligibility() != 0;

        public static object EligibilityStatus()
        {
            var result = CheckEligibility(() => Installed(LauncherAppId), PackageDirectoryVisible, BootEligibility);
            return new {
                launcher_registered = result.Registered,
                package_directory_visible = result.DirectoryVisible,
                boot_check = result.BootCheck,
                boot_check_value = result.Value
            };
        }

        internal static (bool? Registered, bool DirectoryVisible, string BootCheck, byte? Value) CheckEligibility(
            Func<bool> registered, Func<bool> directoryVisible, Func<byte> bootEligibility)
        {
            bool? registration = null;
            try { registration = registered(); }
            catch (Exception) { } // The other checks can still report useful evidence.

            if (!directoryVisible()) return (registration, false, "not_run", null);
            try { return (registration, true, "returned", bootEligibility()); }
            catch (DllNotFoundException) { return (registration, true, "library_unavailable", null); }
            catch (EntryPointNotFoundException) { return (registration, true, "entrypoint_unavailable", null); }
        }

        private static bool Installed(string appId)
        {
            IntPtr info;
            int code = app_manager_get_app_info(appId, out info);
            try
            {
                if (code == 0 && info != IntPtr.Zero) return true;
                if (code == NoSuchApp && info == IntPtr.Zero) return false;
                throw new Exception("Application installation query failed: " + code);
            }
            finally
            {
                if (info != IntPtr.Zero && app_info_destroy(info) != 0)
                    throw new Exception("Application information cleanup failed.");
            }
        }
        public static bool Exists()
        {
            // A remaining UI or service registration still needs coordination.
            bool home = Installed(LauncherAppId);
            bool watcher = Installed("DclHome001.Watcher");
            return home || watcher;
        }
        public static object Status()
        {
            try { return new Dictionary<string, object> { ["installed"] = Exists(), ["error"] = null }; }
            catch (Exception error) { return new Dictionary<string, object> { ["installed"] = null, ["error"] = error.Message }; }
        }
    }
}
