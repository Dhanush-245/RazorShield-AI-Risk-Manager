"""Build the approved 5:10 silent 1080p recruiter-demo timeline.

The input must be the native 1920x1080 Playwright recording produced by
``e2e/recruiter-pitch.spec.ts``. Narration is added separately so the video
stream is copied without another quality-reducing encode.
"""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path


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


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recording", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.output.exists():
        parser.error("Choose a new output filename; existing artifacts are preserved")

    source = probe(args.recording)
    video = next(
        stream for stream in source["streams"] if stream["codec_type"] == "video"
    )
    if (video["width"], video["height"]) != (1920, 1080):
        parser.error("Expected a native 1920x1080 recruiter-pitch recording")
    duration = float(source["format"]["duration"])
    if not 299 <= duration <= 305:
        parser.error("Expected the verified five-minute Playwright source recording")

    work = Path(tempfile.mkdtemp(prefix="razorshield-recruiter-1080p-"))
    dashboard = work / "dashboard.png"
    review = work / "review.png"
    run(
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        "1.6",
        "-i",
        str(args.recording),
        "-frames:v",
        "1",
        str(dashboard),
    )
    run(
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        "208",
        "-i",
        str(args.recording),
        "-frames:v",
        "1",
        str(review),
    )

    graph = (
        "[1:v]fps=25,scale=1920:1080,setsar=1,setpts=PTS-STARTPTS[v0];"
        "[0:v]trim=start=5:end=10,setpts=PTS-STARTPTS[v1];"
        "[0:v]trim=start=15:end=30,setpts=(PTS-STARTPTS)*1.3333333333[v2];"
        "[0:v]trim=start=30:end=80,setpts=(PTS-STARTPTS)*1.2[v3];"
        "[0:v]trim=start=80:end=110,setpts=(PTS-STARTPTS)*0.5[v4];"
        "[0:v]trim=start=110:end=140,setpts=(PTS-STARTPTS)*1.1666666667[v5];"
        "[0:v]trim=start=140:end=170,setpts=PTS-STARTPTS[v6];"
        "[0:v]trim=start=170:end=210,setpts=(PTS-STARTPTS)*0.875[v7];"
        "[2:v]fps=25,scale=1920:1080,setsar=1,setpts=PTS-STARTPTS[v8];"
        "[0:v]trim=start=215:end=240,setpts=(PTS-STARTPTS)*0.4[v9];"
        "[0:v]trim=start=243:end=252,setpts=(PTS-STARTPTS)*1.6666666667[v10];"
        "[0:v]trim=start=252:end=270,setpts=(PTS-STARTPTS)*1.1111111111[v11];"
        "[0:v]trim=start=270:end=285,setpts=(PTS-STARTPTS)*0.6666666667[v12];"
        "[0:v]trim=start=285:end=300,setpts=PTS-STARTPTS[v13];"
        "[v0][v1][v2][v3][v4][v5][v6][v7][v8][v9][v10][v11][v12][v13]"
        "concat=n=14:v=1:a=0,fps=25,"
        "unsharp=5:5:0.25:3:3:0.10,format=yuv420p[v]"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    run(
        "ffmpeg",
        "-v",
        "warning",
        "-y",
        "-i",
        str(args.recording),
        "-loop",
        "1",
        "-t",
        "20",
        "-i",
        str(dashboard),
        "-loop",
        "1",
        "-t",
        "20",
        "-i",
        str(review),
        "-filter_complex",
        graph,
        "-map",
        "[v]",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "8",
        "-profile:v",
        "high",
        "-level:v",
        "4.2",
        "-t",
        "310",
        "-movflags",
        "+faststart",
        str(args.output),
    )

    rendered = probe(args.output)
    if abs(float(rendered["format"]["duration"]) - 310) > 0.1:
        raise RuntimeError("Rendered timeline is not 5:10")
    print(args.output)


if __name__ == "__main__":
    main()
