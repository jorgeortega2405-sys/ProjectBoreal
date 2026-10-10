import logging
import os
from typing import Optional, Tuple
from PIL import Image, ImageOps

logger = logging.getLogger("image_processor")

class ImageProcessor:
    @staticmethod
    def compute_dhash(img: Image.Image, hash_size: int = 8) -> str:
        resized = img.resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS).convert("L")
        pixels = list(resized.tobytes())
        diff = []
        for row in range(hash_size):
            for col in range(hash_size):
                pixel_left = pixels[row * (hash_size + 1) + col]
                pixel_right = pixels[row * (hash_size + 1) + col + 1]
                diff.append(pixel_left > pixel_right)

        decimal_val = 0
        hex_str = []
        for index, val in enumerate(diff):
            if val:
                decimal_val += 2 ** (index % 4)
            if index % 4 == 3:
                hex_str.append(hex(decimal_val)[2:])
                decimal_val = 0
        return "".join(hex_str).zfill(16)

    @staticmethod
    def hamming_distance(hash1: str, hash2: str) -> int:
        if not hash1 or not hash2 or len(hash1) != 16 or len(hash2) != 16:
            return 64
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        return bin(val1 ^ val2).count("1")

    @classmethod
    def optimize_image_for_ocr(cls, file_path: str, max_dim: int = 1800) -> Tuple[Image.Image, str]:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".pdf":
            doc = None
            try:
                import fitz
                doc = fitz.open(file_path)
                if len(doc) == 0:
                    raise ValueError("El archivo PDF está vacío.")
                page = doc.load_page(0)
                pix = page.get_pixmap(dpi=150)
                base_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            except Exception as e:
                raise RuntimeError(f"Error al convertir PDF a imagen: {e}")
            finally:
                if doc:
                    try:
                        doc.close()
                    except Exception:
                        pass
        else:
            with Image.open(file_path) as opened_img:
                opened_img = ImageOps.exif_transpose(opened_img)
                base_img = opened_img.convert("RGB")

        w, h = base_img.size
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            resized_img = base_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            base_img.close()
            base_img = resized_img

        dhash_str = cls.compute_dhash(base_img)

        gray = base_img.convert("L")
        enhanced = ImageOps.autocontrast(gray, cutoff=2)
        base_img.close()
        final_img = enhanced.convert("RGB")
        enhanced.close()

        return final_img, dhash_str

    @classmethod
    def check_and_register_dhash(
        cls,
        redis_client,
        dhash_str: str,
        order_uuid: str,
        ttl_seconds: int = 90 * 86400,
        max_distance: int = 3
    ) -> Optional[str]:
        if not redis_client or not dhash_str:
            return None

        exact_key = f"boreal:receipt:dhash:{dhash_str}"
        try:
            existing = redis_client.get(exact_key)
            if existing and existing != order_uuid:
                return existing

            recent_hashes = redis_client.lrange("boreal:receipt:recent_dhashes", 0, 200)
            for item in recent_hashes:
                if ":" in item:
                    stored_hash, stored_order = item.split(":", 1)
                    if stored_order != order_uuid and cls.hamming_distance(dhash_str, stored_hash) <= max_distance:
                        return stored_order

            redis_client.set(exact_key, order_uuid, ex=ttl_seconds)
            redis_client.lpush("boreal:receipt:recent_dhashes", f"{dhash_str}:{order_uuid}")
            redis_client.ltrim("boreal:receipt:recent_dhashes", 0, 500)
        except Exception as e:
            logger.warning(f"Error al verificar dHash en Redis: {e}")

        return None
