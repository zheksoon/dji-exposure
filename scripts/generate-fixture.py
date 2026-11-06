"""Generate a tiny, original synthetic ISO-BMFF file; no camera/video data."""

from pathlib import Path
from struct import pack

ROOT = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def box(kind, data):
    return pack(">I4s", len(data) + 8, kind.encode()) + data


def full(kind, data, flags=0):
    return box(kind, pack(">I", flags) + data)


def u32(*n):
    return pack(">" + "I" * len(n), *n)


def vint(n):
    b = bytearray()
    while n > 127:
        b.append((n & 127) | 128)
        n >>= 7
    b.append(n)
    return bytes(b)


def field(n, data):
    return vint(n * 8 + 2) + vint(len(data)) + data


def sample(frame):
    ident = field(1, field(1, field(1, b"dvtm_PP-101.proto")))
    frameinfo = vint(8) + vint(frame)
    iso = field(9, vint(13) + pack("<f", 400 + frame * 100))
    shutter = field(10, field(1, vint(1) + vint(143)))
    ct = field(24, vint(8) + vint(5600))
    return ident + field(3, field(1, frameinfo) + field(2, iso + shutter + ct))


MATRIX = u32(65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824)
ftyp = box("ftyp", b"isom" + u32(0) + b"isom")
samples = [sample(0), sample(1), sample(2)]
mdat = box("mdat", b"".join(samples))


def movie(offset, large=False, codec="djmd"):
    mvhd = full(
        "mvhd",
        u32(0, 0, 30000, 3003, 65536)
        + pack(">HH", 256, 0)
        + bytes(8)
        + MATRIX
        + bytes(24)
        + u32(2),
    )
    tkhd = full(
        "tkhd", u32(0, 0, 1, 0, 3003) + bytes(8) + bytes(8) + MATRIX + u32(0, 0), 3
    )
    mdhd = full("mdhd", u32(0, 0, 30000, 3003) + pack(">HH", 21956, 0))
    hdlr = full(
        "hdlr",
        u32(0)
        + b"meta"
        + bytes(12)
        + (b"TimeCodeHandler\0" if codec == "mett" else b"DJI synthetic\0"),
    )
    stsd = full(
        "stsd",
        u32(1)
        + box(codec, bytes(6) + pack(">H", 1) + (b"\0\0" if codec == "mett" else b"")),
    )
    stts = full("stts", u32(1, 3, 1001))
    stsc = full("stsc", u32(1, 1, 3, 1))
    stsz = full("stsz", u32(0, 3) + u32(*(len(s) for s in samples)))
    offsets = (
        full("co64", u32(1) + pack(">Q", offset))
        if large
        else full("stco", u32(1, offset))
    )
    stbl = box("stbl", stsd + stts + stsc + stsz + offsets)
    dref = full("dref", u32(1) + full("url ", b"", 1))
    minf = box("minf", full("nmhd", b"") + box("dinf", dref) + stbl)
    return box("moov", mvhd + box("trak", tkhd + box("mdia", mdhd + hdlr + minf)))


ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "pocket3-tail.mp4").write_bytes(ftyp + mdat + movie(len(ftyp) + 8))
m = movie(0)
(ROOT / "pocket3-front.mp4").write_bytes(ftyp + movie(len(ftyp) + len(m) + 8) + mdat)
# Tiny pieces used to create a temporary sparse >4GiB file in the browser tests.
large_offset = 2**32 + 128
(ROOT / "large-ftyp.bin").write_bytes(ftyp)
(ROOT / "large-moov.bin").write_bytes(movie(large_offset, True))
(ROOT / "large-metadata.bin").write_bytes(b"".join(samples))
(ROOT / "pocket3-no-ftyp.mov").write_bytes(mdat + movie(8))
(ROOT / "no-dji.mp4").write_bytes(ftyp + mdat + movie(len(ftyp) + 8, codec="mett"))
print("Generated fixtures in", ROOT)
