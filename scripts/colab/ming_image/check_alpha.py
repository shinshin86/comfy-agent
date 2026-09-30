"""Inspect original 8-bit RGB/RGBA PNG output without third-party packages."""

import argparse
import json
from pathlib import Path
import struct
import zlib


def paeth(a, b, c):
    p = a + b - c
    distances = (abs(p - a), abs(p - b), abs(p - c))
    return (a, b, c)[distances.index(min(distances))]


def inspect_png(path):
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Expected a PNG file.")
    offset, header, compressed, ended = 8, None, bytearray(), False
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError("Truncated PNG chunk.")
        size = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 8 + size
        if end + 4 > len(data):
            raise ValueError("Truncated PNG chunk data.")
        payload = data[offset + 8:end]
        crc = struct.unpack_from(">I", data, end)[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise ValueError("PNG checksum mismatch.")
        if header is None and kind != b"IHDR":
            raise ValueError("IHDR must be the first chunk.")
        if kind == b"IHDR":
            if header is not None or size != 13:
                raise ValueError("Invalid IHDR.")
            header = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind in (b"tRNS", b"acTL"):
            raise ValueError("Palette/key transparency and animated PNG are unsupported; use original RGBA SaveImage output.")
        elif kind == b"IEND":
            if size != 0 or end + 4 != len(data):
                raise ValueError("Invalid PNG ending.")
            ended = True
            break
        offset = end + 4
    if header is None or not ended:
        raise ValueError("Incomplete PNG.")
    width, height, depth, color, compression, filtering, interlace = header
    if (depth, compression, filtering, interlace) != (8, 0, 0, 0) or color not in (2, 6):
        raise ValueError("Only non-interlaced 8-bit RGB/RGBA PNG is supported.")
    if width < 1 or height < 1 or width * height > 16_777_216:
        raise ValueError("Unsupported image dimensions (maximum 16 megapixels).")
    channels = 4 if color == 6 else 3
    stride = width * channels
    expected = height * (stride + 1)
    decoder = zlib.decompressobj()
    raw = decoder.decompress(bytes(compressed), expected + 1)
    if len(raw) != expected or not decoder.eof or decoder.unused_data:
        raise ValueError("Invalid or oversized PNG pixel data.")
    previous = bytearray(stride)
    transparent, opaque, visible, alpha_min, alpha_max = 0, 0, 0, 255, 0
    for y in range(height):
        start = y * (stride + 1)
        filter_type = raw[start]
        if filter_type > 4:
            raise ValueError("Unknown PNG filter.")
        row = bytearray(raw[start + 1:start + stride + 1])
        for x in range(stride):
            left = row[x - channels] if x >= channels else 0
            up = previous[x]
            corner = previous[x - channels] if x >= channels else 0
            predictor = (0, left, up, (left + up) // 2, paeth(left, up, corner))[filter_type]
            row[x] = (row[x] + predictor) & 255
        if color == 6:
            for alpha in row[3::4]:
                transparent += alpha <= 4
                opaque += alpha >= 251
                visible += alpha > 4
                alpha_min, alpha_max = min(alpha_min, alpha), max(alpha_max, alpha)
        previous = row
    pixels = width * height
    return {
        "width": width, "height": height, "png_color_type": color,
        "has_alpha": color == 6,
        "alpha_min": alpha_min if color == 6 else None,
        "alpha_max": alpha_max if color == 6 else None,
        "transparent_fraction": transparent / pixels if color == 6 else None,
        "opaque_fraction": opaque / pixels if color == 6 else None,
        "visible_pixels": visible if color == 6 else None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png", type=Path)
    parser.add_argument("--min-transparent-fraction", type=float, default=0.01)
    args = parser.parse_args()
    if not 0 < args.min_transparent_fraction <= 1:
        parser.error("--min-transparent-fraction must be in (0, 1].")
    try:
        report = inspect_png(args.png)
    except (OSError, ValueError, zlib.error) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 2
    report["ok"] = bool(
        report["has_alpha"] and report["visible_pixels"] > 0
        and report["transparent_fraction"] >= args.min_transparent_fraction
    )
    print(json.dumps(report))
    return 0 if report["ok"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
