import argparse
import json
from pathlib import Path

import fitz


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--prefix", default="page_")
    parser.add_argument("--dpi", type=int, default=300)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    scale = args.dpi / 72
    matrix = fitz.Matrix(scale, scale)
    pages = []

    with fitz.open(input_path) as document:
        for index, page in enumerate(document, start=1):
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            file_name = f"{args.prefix}{index:03d}.png"
            target = output_dir / file_name
            pixmap.save(target)
            pages.append(
                {
                    "pageNumber": index,
                    "fileName": file_name,
                    "width": pixmap.width,
                    "height": pixmap.height,
                }
            )

    print(json.dumps({"pages": pages}, ensure_ascii=False))


if __name__ == "__main__":
    main()
