#!/usr/bin/env python3
"""Optional SAM 2.1 Tiny image segmentation worker. No Electron dependencies."""
import argparse
import json
import sys
from pathlib import Path


def parser():
    p = argparse.ArgumentParser(description="Segment one image using SAM 2.1 Tiny.")
    p.add_argument("--input", required=True, help="Source image")
    p.add_argument("--output-mask", required=True, help="Grayscale PNG mask")
    p.add_argument("--output-rgba", help="Optional transparent PNG")
    p.add_argument("--checkpoint", required=True, help="Local sam2.1_hiera_tiny.pt")
    p.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    p.add_argument("--points", help='JSON array of [x,y] pixel coordinates')
    p.add_argument("--labels", help="JSON 0/1 array, matching --points")
    p.add_argument("--box", help="JSON [x1,y1,x2,y2] coordinates")
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    # Validate before initializing the expensive model.
    source = Path(args.input)
    checkpoint = Path(args.checkpoint)
    if not source.is_file():
        raise ValueError("Input image not found")
    if not checkpoint.is_file():
        raise ValueError("SAM 2.1 checkpoint not found")
    if not args.points and not args.box:
        raise ValueError("Provide --points or --box")

    import numpy as np
    import torch
    from PIL import Image
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    with Image.open(source) as im:
        rgb = im.convert("RGB")
        frame = np.asarray(rgb)
    points = np.asarray(json.loads(args.points), dtype=np.float32) if args.points else None
    labels = np.asarray(json.loads(args.labels), dtype=np.int32) if args.labels else None
    box = np.asarray(json.loads(args.box), dtype=np.float32) if args.box else None
    height, width = frame.shape[:2]
    if points is not None:
        if points.ndim != 2 or points.shape[1] != 2 or len(points) == 0:
            raise ValueError("--points must be nonempty [[x,y],...]")
        if labels is None or labels.shape != (len(points),) or not np.isin(labels, [0, 1]).all():
            raise ValueError("--labels must be 0/1 for every point")
        if not np.isfinite(points).all() or np.any(points < 0) or np.any(points[:, 0] >= width) or np.any(points[:, 1] >= height):
            raise ValueError("Point outside source image")
    if box is not None:
        if box.shape != (4,) or not np.isfinite(box).all():
            raise ValueError("--box must contain four finite coordinates")
        x1, y1, x2, y2 = box
        if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
            raise ValueError("Box outside source image or invalid")

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA explicitly requested but unavailable")
    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    model = build_sam2("configs/sam2.1/sam2.1_hiera_t.yaml", str(checkpoint), device=device, apply_postprocessing=False)
    predictor = SAM2ImagePredictor(model)
    with torch.inference_mode():
        predictor.set_image(frame)
        masks, scores, _ = predictor.predict(
            point_coords=points, point_labels=labels, box=box,
            multimask_output=False,
        )
    mask = (masks[0].astype(np.uint8) * 255)
    out = Path(args.output_mask)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask, mode="L").save(out)
    if args.output_rgba:
        rgba = np.dstack((frame, mask))
        dst = Path(args.output_rgba)
        dst.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba, mode="RGBA").save(dst)
    print(json.dumps({
        "ok": True, "model": "sam2.1_hiera_tiny", "device": device,
        "width": width, "height": height,
        "mask": str(out.resolve()),
        "rgba": str(Path(args.output_rgba).resolve()) if args.output_rgba else None,
        "score": float(scores[0]),
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
