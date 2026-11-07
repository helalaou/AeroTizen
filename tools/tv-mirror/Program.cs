using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    // The Frame uses the ARM32 RequestedData layout documented by q80a-debloat.
    [DllImport("libdisplay-capture-api.so.0", EntryPoint = "_Z10ppicaptureP13RequestedDataPhS1_i",
        CallingConvention = CallingConvention.Cdecl)]
    private static extern int Capture(IntPtr request, IntPtr luma, IntPtr chroma, int capacity);

    private const int RequestedWidth = 960;
    private const int FrameWidth = 720;
    private const int FrameHeight = 540;
    private const int Capacity = RequestedWidth * FrameHeight;
    private const int LumaSize = FrameWidth * FrameHeight;
    private const int ChromaSize = LumaSize / 2;

    public static int Main(string[] args)
    {
        if (IntPtr.Size != 4 || args.Length != 4 || !IPAddress.TryParse(args[0], out var address) ||
            !int.TryParse(args[1], out int port) || port is < 1 or > 65535 ||
            !int.TryParse(args[2], out int seconds) || seconds is < 1 or > 600)
            return 2;

        using var watchdog = new Timer(_ => Environment.Exit(124), null, (seconds + 5) * 1000, Timeout.Infinite);
        var requestBytes = new byte[512];
        IntPtr request = Marshal.AllocHGlobal(requestBytes.Length);
        IntPtr lumaBuffer = Marshal.AllocHGlobal(Capacity);
        IntPtr chromaBuffer = Marshal.AllocHGlobal(Capacity);
        var frame = new byte[LumaSize + ChromaSize];
        try
        {
            using var client = new TcpClient { SendTimeout = 3000 };
            client.Connect(address, port);
            using NetworkStream stream = client.GetStream();
            stream.Write(Encoding.ASCII.GetBytes($"frames {args[3]}\n"));
            var timer = Stopwatch.StartNew();
            while (timer.Elapsed.TotalSeconds < seconds)
            {
                Marshal.Copy(requestBytes, 0, request, requestBytes.Length);
                Marshal.WriteInt32(request, 0x00, RequestedWidth);
                Marshal.WriteInt32(request, 0x04, FrameHeight);
                Marshal.WriteInt32(request, 0x24, 2);
                Marshal.WriteInt32(request, 0x28, 6);
                if (Capture(request, lumaBuffer, chromaBuffer, Capacity) != 0)
                    return 3;

                // The API can report the buffer capacity instead of the visible plane size.
                int width = Marshal.ReadInt32(request, 0x00);
                int height = Marshal.ReadInt32(request, 0x04);
                int lumaSize = Marshal.ReadInt32(request, 0x0c);
                int chromaSize = Marshal.ReadInt32(request, 0x10);
                IntPtr luma = Marshal.ReadIntPtr(request, 0x14);
                IntPtr chroma = Marshal.ReadIntPtr(request, 0x18);
                if (width != FrameWidth || height != FrameHeight || lumaSize is < LumaSize or > Capacity ||
                    chromaSize is < ChromaSize or > Capacity || luma == IntPtr.Zero || chroma == IntPtr.Zero)
                    return 4;

                Marshal.Copy(luma, frame, 0, LumaSize);
                Marshal.Copy(chroma, frame, LumaSize, ChromaSize);
                stream.Write(frame);
                Thread.Sleep(75);
            }
            return 0;
        }
        catch (IOException)
        {
            return 5;
        }
        catch (SocketException)
        {
            return 5;
        }
        catch (DllNotFoundException)
        {
            return 6;
        }
        catch (EntryPointNotFoundException)
        {
            return 6;
        }
        finally
        {
            Marshal.FreeHGlobal(request);
            Marshal.FreeHGlobal(lumaBuffer);
            Marshal.FreeHGlobal(chromaBuffer);
        }
    }
}
