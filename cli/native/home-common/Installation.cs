// Read-only installation checks shared by the query and writer.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace AeroTizen.Home
{
    public static class Installation
    {
        // Samsung TizenFX Interop.ApplicationManager.ErrorCode.NoSuchApp.
        private const int NoSuchApp = -0x01110000 | 0x01;
        [DllImport("libcapi-appfw-app-manager.so.0")]
        private static extern int app_manager_get_app_info(string appId, out IntPtr info);
        [DllImport("libcapi-appfw-app-manager.so.0")]
        private static extern int app_info_destroy(IntPtr info);

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
            bool home = Installed("DclHome001.Home");
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
