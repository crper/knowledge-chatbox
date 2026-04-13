"""图片预处理工具函数。"""

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


def prepare_image_bytes(
    source_path: Path,
    *,
    max_dimension: int = 1600,
    quality: int = 85,
) -> tuple[int, int, bytes]:
    with Image.open(source_path) as source_image:
        prepared_image = ImageOps.exif_transpose(source_image).convert("RGB")
        width, height = prepared_image.size
        prepared_image.thumbnail((max_dimension, max_dimension))
        buffer = BytesIO()
        prepared_image.save(buffer, format="JPEG", quality=quality)
        return width, height, buffer.getvalue()
