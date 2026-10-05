import asyncio
import os
from PIL import Image

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

    def _load_image(self, file_path: str) -> Image.Image:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".pdf":
            doc = None
            try:
                import fitz
                doc = fitz.open(file_path)
                if len(doc) == 0:
                    raise ValueError("El archivo PDF está vacío.")
                page = doc.load_page(0)
                pix = page.get_pixmap(dpi=200)
                return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            except Exception as e:
                raise RuntimeError(f"Error al convertir PDF a imagen: {e}")
            finally:
                if doc:
                    try:
                        doc.close()
                    except Exception:
                        pass
        with Image.open(file_path) as opened_img:
            return opened_img.copy()

    def extract_text(self, file_path: str) -> str:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Archivo no encontrado: {file_path}")

        img = self._load_image(file_path)
        try:
            if HAS_PYTESSERACT:
                try:
                    text = pytesseract.image_to_string(img, lang="spa")
                    if text and len(text.strip()) > 5:
                        return text
                except Exception:
                    pass

            if HAS_WINOCR:
                res = asyncio.run(winocr.recognize_pil(img, lang=self.lang))
                return res.text

            if HAS_PYTESSERACT:
                return pytesseract.image_to_string(img)

            raise RuntimeError("No se encontró ningún motor OCR disponible (pytesseract o winocr).")
        finally:
            try:
                img.close()
            except Exception:
                pass
