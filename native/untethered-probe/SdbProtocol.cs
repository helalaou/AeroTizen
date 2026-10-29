using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace AeroTizen.UntetheredProbe
{
    internal sealed class SdbServiceRefusedException : IOException
    {
        internal SdbServiceRefusedException() : base("Local SDB refused the service") { }
    }

    internal sealed class Deadline
    {
        private readonly Stopwatch watch = Stopwatch.StartNew();
        private readonly int limit;
        internal Deadline(int milliseconds) { limit = milliseconds; }
        internal int Remaining
        {
            get
            {
                long value = limit - watch.ElapsedMilliseconds;
                if (value <= 0) throw new TimeoutException("SDB deadline expired");
                return (int)value;
            }
        }
    }

    internal sealed class Frame
    {
        internal const int MaxPayload = 256 * 1024;
        internal readonly string Command;
        internal readonly uint Arg0, Arg1;
        internal readonly byte[] Payload;
        internal Frame(string command, uint arg0, uint arg1, byte[] payload)
        {
            Command = command; Arg0 = arg0; Arg1 = arg1; Payload = payload;
        }
        private static byte[] Exact(Stream stream, int count, Deadline deadline, string part)
        {
            var data = new byte[count];
            int offset = 0;
            while (offset < count)
            {
                int remaining = deadline.Remaining;
                if (stream.CanTimeout) stream.ReadTimeout = remaining;
                int received = stream.Read(data, offset, count - offset);
                if (received == 0) throw new EndOfStreamException("Truncated SDB " + part + " (" + offset + "/" + count + " bytes)");
                offset += received;
            }
            return data;
        }
        private static uint Checksum(byte[] data)
        {
            uint value = 0;
            foreach (byte item in data) value = unchecked(value + item);
            return value;
        }
        private static bool Known(string command)
        {
            return command == "CNXN" || command == "AUTH" || command == "OPEN"
                || command == "OKAY" || command == "WRTE" || command == "CLSE";
        }
        internal static Frame Read(Stream stream, Deadline deadline)
        {
            byte[] header = Exact(stream, 24, deadline, "header");
            string command = Encoding.ASCII.GetString(header, 0, 4);
            uint tag = BitConverter.ToUInt32(header, 0);
            uint length = BitConverter.ToUInt32(header, 12);
            if (!Known(command) || BitConverter.ToUInt32(header, 20) != (tag ^ uint.MaxValue)
                || length > MaxPayload) throw new InvalidDataException("Invalid SDB frame header");
            byte[] payload = Exact(stream, (int)length, deadline, "payload");
            if (Checksum(payload) != BitConverter.ToUInt32(header, 16))
                throw new InvalidDataException("Invalid SDB frame checksum");
            return new Frame(command, BitConverter.ToUInt32(header, 4), BitConverter.ToUInt32(header, 8), payload);
        }
        internal void Write(Stream stream)
        {
            if (!Known(Command) || Payload.Length > MaxPayload) throw new InvalidDataException("Invalid SDB frame");
            byte[] tag = Encoding.ASCII.GetBytes(Command);
            using (var buffer = new MemoryStream())
            using (var writer = new BinaryWriter(buffer, Encoding.ASCII, true))
            {
                writer.Write(tag); writer.Write(Arg0); writer.Write(Arg1);
                writer.Write((uint)Payload.Length); writer.Write(Checksum(Payload));
                writer.Write(BitConverter.ToUInt32(tag, 0) ^ uint.MaxValue); writer.Write(Payload);
                byte[] data = buffer.ToArray();
                stream.Write(data, 0, data.Length);
            }
        }
    }

    internal sealed class LoopbackSdb : IDisposable
    {
        internal const int Port = 26101;
        private readonly TcpClient client = new TcpClient(AddressFamily.InterNetwork);
        private NetworkStream stream;
        private uint sequence, peerLimit;
        internal string Stage { get; private set; } = "not-connected";
        internal void Connect(int port = Port, int milliseconds = 6000)
        {
            // Never accept a host argument: the on-TV probe can only contact loopback.
            if (milliseconds <= 0 || milliseconds > 6000) throw new ArgumentOutOfRangeException(nameof(milliseconds));
            var deadline = new Deadline(milliseconds);
            Stage = "tcp-connect";
            var task = client.ConnectAsync(IPAddress.Loopback, port);
            if (!task.Wait(Math.Min(3000, deadline.Remaining))) throw new TimeoutException("Local SDB connect timed out");
            task.GetAwaiter().GetResult();
            client.SendTimeout = Math.Min(3000, deadline.Remaining);
            stream = client.GetStream();
            Stage = "cnxn-send";
            new Frame("CNXN", 0x01000000, Frame.MaxPayload,
                Encoding.ASCII.GetBytes("host::aerotizen-root-probe\0")).Write(stream);
            Stage = "cnxn-reply";
            Frame reply = Frame.Read(stream, new Deadline(Math.Min(3000, deadline.Remaining)));
            if (reply.Command != "CNXN" || reply.Arg1 < 1024 || reply.Arg1 > Frame.MaxPayload)
                throw new InvalidDataException("Local SDB did not authorize the probe");
            peerLimit = reply.Arg1;
            Stage = "connected";
        }
        internal string Service(string name, int milliseconds = 5000)
        {
            if (stream == null) throw new InvalidOperationException("SDB is not connected");
            byte[] request = Encoding.UTF8.GetBytes(name + "\0");
            if (request.Length > peerLimit) throw new InvalidDataException("SDB request too large");
            uint local = ++sequence, remote = 0;
            Stage = "service-open";
            new Frame("OPEN", local, 0, request).Write(stream);
            Stage = "service-reply";
            var deadline = new Deadline(milliseconds);
            using (var output = new MemoryStream())
            {
                while (true)
                {
                    Frame reply = Frame.Read(stream, deadline);
                    if (reply.Arg1 != local) throw new InvalidDataException("Uncorrelated SDB reply");
                    if (reply.Command == "OKAY") remote = reply.Arg0;
                    else if (reply.Command == "WRTE")
                    {
                        if (remote != 0 && reply.Arg0 != remote) throw new InvalidDataException("SDB stream changed");
                        remote = reply.Arg0;
                        if (output.Length + reply.Payload.Length > 16384)
                            throw new InvalidDataException("SDB output limit exceeded");
                        output.Write(reply.Payload, 0, reply.Payload.Length);
                        new Frame("OKAY", local, remote, Array.Empty<byte>()).Write(stream);
                    }
                    else if (reply.Command == "CLSE")
                    {
                        if (remote == 0) throw new SdbServiceRefusedException();
                        new Frame("CLSE", local, reply.Arg0, Array.Empty<byte>()).Write(stream);
                        Stage = "service-complete";
                        return Encoding.UTF8.GetString(output.ToArray());
                    }
                    else throw new InvalidDataException("Unexpected SDB service reply");
                }
            }
        }
        public void Dispose() { stream?.Dispose(); client.Dispose(); }
    }
}
