import asyncio
import os
from typing import Tuple
from PIL import Image
from image_processor import ImageProcessor

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:
    HAS_PYTESSERACT = False

try:
    import winocr
    HAS_WINOCR = True
except ImportError:
    HAS_WINOCR = False

class OCREngine:
    def __init__(self, lang: str = "es-MX"):
        self.lang = lang

    def extract_text_and_hash(self, file_path: str) -> Tuple[str, str]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Archivo no encontrado: {file_path}")

        img, dhash_str = ImageProcessor.optimize_image_for_ocr(file_path)
        try:
            if HAS_PYTESSERACT:
                try:
                    text = pytesseract.image_to_string(img, lang="spa")
                    if text and len(text.strip()) > 5:
                        return text, dhash_str
                except Exception:
                    pass

            if HAS_WINOCR:
                res = asyncio.run(winocr.recognize_pil(img, lang=self.lang))
                return res.text, dhash_str

            if HAS_PYTESSERACT:
                return pytesseract.image_to_string(img), dhash_str

            raise RuntimeError("No se encontró ningún motor OCR disponible (pytesseract o winocr).")
        finally:
            try:
                img.close()
            except Exception:
                pass

    def extract_text(self, file_path: str) -> str:
        text, _ = self.extract_text_and_hash(file_path)
        return text
