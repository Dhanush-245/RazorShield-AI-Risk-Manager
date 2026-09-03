"""Export the opt-in continuous browser recording, without a synthetic narrator.

Visible captions are recorded by feature-tour.spec.ts. This script transcodes,
trims only the ending to five minutes, and preserves the source WebM. It does not
create screenshots, synthesize speech or speed up the demonstration.
"""

import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def probe(path: Path) -> dict:
    return json.loads(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            text=True,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recording", required=True, type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "outputs/submission/razorshield-authentication-feature-tour.mp4",
    )
    args = parser.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            parser.error(f"Missing local dependency: {tool}")
    original = args.output.with_suffix(".webm")
    if args.output.exists() or original.exists():
        parser.error("Choose a new output filename; existing recordings are preserved")
    source = probe(args.recording)
    if float(source["format"]["duration"]) < 300:
        parser.error(
            "Source is shorter than five minutes; use the paced recording, not FAST mode"
        )
    if any(stream["codec_type"] == "audio" for stream in source["streams"]):
        parser.error("Unexpected audio in source; review it before exporting")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.recording, original)
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-i",
            str(original),
            "-t",
            "300",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(args.output),
        ],
        check=True,
    )
    result = probe(args.output)
    duration = float(result["format"]["duration"])
    if abs(duration - 300) > 0.1:
        raise ValueError(f"Unexpected exported duration: {duration}")
    print(
        json.dumps(
            {
                "path": str(args.output),
                "seconds": duration,
                "bytes": int(result["format"]["size"]),
                "streams": [
                    {
                        key: stream.get(key)
                        for key in ("codec_type", "codec_name", "width", "height")
                    }
                    for stream in result["streams"]
                ],
                "audio": "None. Record the applicant's own narration separately.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
