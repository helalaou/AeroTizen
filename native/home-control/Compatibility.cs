// Read-only preflight: never call a native setter to test compatibility.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace AeroTizen.Home
{
    internal static class Compatibility
    {
        internal const string Libc = "libc.so.6";
        internal const string Vconf = "libvconf.so.0";
        internal const string AppOperation = "libcapi-appfw-app-operation-tv.so.0";
        internal const string AppManager = "libcapi-appfw-app-manager.so.0";
        internal const string AppContext = "libapp-context-manager-common.so";

        internal static void RequireRuntime(int pointerSize, Architecture architecture, uint uid, IDictionary<string, string> os)
        {
            if (pointerSize != 4 || architecture != Architecture.Arm || uid != 901)
                throw new Exception("Native Home requires a 32-bit ARM Tizen runtime and SDK UID 901; root is not used.");
            string id, build, version;
            if (!os.TryGetValue("ID", out id) || id != "tizen" ||
                !os.TryGetValue("BUILD_ID", out build) || string.IsNullOrWhiteSpace(build) ||
                !os.TryGetValue("VERSION_ID", out version) || string.IsNullOrWhiteSpace(version))
                throw new Exception("Native Home requires Tizen with readable firmware and OS version metadata.");
        }
        internal static void RequireApis(bool applying, Action<string, string[]> require)
        {
            require(Libc, new[] { "getuid", "free" });
            require(Vconf, new[] { "vconf_get_str", "vconf_get_int", "vconf_set_str", "vconf_set_int" });
            require(AppOperation, new[] { "app_operation_get_current_app", "app_operation_set_current_app" });
            require(AppManager, new[] { "app_manager_get_app_info", "app_info_destroy" });
            // Recovery must remain possible after uninstall, without an eligible launcher.
            if (applying) require(AppContext, new[] { "util_is_appbooting_supported_webapp_byappid" });
        }
        internal static void RequireExports(string library, string[] symbols)
        {
            IntPtr handle;
            if (!NativeLibrary.TryLoad(library, out handle))
                throw new Exception("Native Home compatibility check failed: required library is unavailable: " + library);
            try
            {
                foreach (string symbol in symbols)
                {
                    IntPtr address;
                    if (!NativeLibrary.TryGetExport(handle, symbol, out address) || address == IntPtr.Zero)
                        throw new Exception("Native Home compatibility check failed: required function is unavailable: " + symbol);
                }
            }
            finally { NativeLibrary.Free(handle); }
        }
    }
}
