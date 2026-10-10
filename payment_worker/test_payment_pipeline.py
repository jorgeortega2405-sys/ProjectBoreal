import datetime
import io
import os
import sys
import time
import unittest
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))

from image_processor import ImageProcessor
from banxico_client import BanxicoClient
from receipt_parser import ReceiptParser

class TestPaymentPipeline(unittest.TestCase):
    def setUp(self):
        BanxicoClient.record_success()

    def test_image_downsampling(self):
        # Crear imagen sintética gigante (3600 x 2400)
        large_img = Image.new("RGB", (3600, 2400), color=(240, 240, 240))
        test_path = os.path.join(os.path.dirname(__file__), "test_sample_large.jpg")
        large_img.save(test_path, format="JPEG", quality=90)
        large_img.close()

        try:
            optimized, dhash_str = ImageProcessor.optimize_image_for_ocr(test_path, max_dim=1800)
            w, h = optimized.size
            self.assertLessEqual(max(w, h), 1800)
            self.assertEqual(len(dhash_str), 16)
            self.assertEqual(round(w / h, 2), round(3600 / 2400, 2))
            optimized.close()
        finally:
            if os.path.exists(test_path):
                os.remove(test_path)

    def test_dhash_perceptual_similarity(self):
        img_a = Image.new("RGB", (1000, 1000), color="white")
        # Dibujar un patrón simple
        for x in range(200, 800):
            for y in range(400, 600):
                img_a.putpixel((x, y), (0, 0, 0))

        # Versión B: misma imagen pero ligeramente redimensionada
        img_b = img_a.resize((800, 800), Image.Resampling.LANCZOS)

        # Versión C: imagen completamente diferente
        img_c = Image.new("RGB", (1000, 1000), color="blue")
        for x in range(100, 300):
            for y in range(100, 900):
                img_c.putpixel((x, y), (255, 255, 0))

        hash_a = ImageProcessor.compute_dhash(img_a)
        hash_b = ImageProcessor.compute_dhash(img_b)
        hash_c = ImageProcessor.compute_dhash(img_c)

        dist_ab = ImageProcessor.hamming_distance(hash_a, hash_b)
        dist_ac = ImageProcessor.hamming_distance(hash_a, hash_c)

        self.assertLessEqual(dist_ab, 3, f"Las imágenes visualmente idénticas deben tener distancia <= 3 (obtenido: {dist_ab})")
        self.assertGreater(dist_ac, 10, f"Las imágenes distintas deben tener distancia > 10 (obtenido: {dist_ac})")

        img_a.close()
        img_b.close()
        img_c.close()

    def test_circuit_breaker_trip_and_recovery(self):
        self.assertFalse(BanxicoClient.is_circuit_open())

        # Simular 4 fallas (no debe abrir el circuito aún)
        for _ in range(4):
            BanxicoClient.record_failure()
        self.assertFalse(BanxicoClient.is_circuit_open())

        # Quinta falla: debe disparar el Circuit Breaker
        BanxicoClient.record_failure()
        self.assertTrue(BanxicoClient.is_circuit_open())

        status = BanxicoClient.get_circuit_status()
        self.assertTrue(status["is_open"])
        self.assertGreater(status["cooldown_remaining_seconds"], 0)

        # Consulta mientras está abierto debe rechazar inmediatamente sin red
        res = BanxicoClient.query_cep("MBAN01234567890123", 500.0)
        self.assertEqual(res["status"], "circuit_open")
        self.assertTrue(res["retryable"])

        # Recuperación exitosa
        BanxicoClient.record_success()
        self.assertFalse(BanxicoClient.is_circuit_open())

    def test_rate_limiter_pacing(self):
        t0 = time.time()
        BanxicoClient._enforce_rate_limit()
        BanxicoClient._enforce_rate_limit()
        t1 = time.time()
        # Debe haber transcurrido al menos el intervalo mínimo de 0.35s
        self.assertGreaterEqual(t1 - t0, 0.30)

    def test_receipt_parser_intrabank_detection(self):
        dummy_text = "Transferencia exitosa a cuenta BBVA 012345678901234567 por $150.00 Folio 987654321"
        parsed = ReceiptParser.parse(dummy_text)
        self.assertEqual(parsed["amount"], 150.0)
        self.assertTrue(parsed["is_success"])

if __name__ == "__main__":
    unittest.main()
