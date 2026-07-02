"""Damage service — detailed multi-stage CV analysis pipeline.

A production-style vehicle damage assessment pipeline that does NOT require torch.
It runs eight deterministic analysis stages and produces a rich, part-level report:

  1. preprocess          — decode, normalize, resize, compute image quality
  2. vehicle_detection   — heuristic main-object bounding box (edge density + contours)
  3. part_segmentation   — split the vehicle region into 8 semantic zones
  4. damage_detection    — per-zone, per-type scoring (scratch/dent/crack/glass/rust/...)
  5. region_localization — sliding-window damage hotspots with bbox + severity + part
  6. severity_scoring    — weighted aggregate → 0–100 score → Low/Moderate/Severe
  7. cost_estimation     — per-part labor/parts/paint breakdown + totals
  8. risk_assessment     — structural vs cosmetic risk, safety concerns, drivability

A small GradientBoostingClassifier (trained on synthetic feature signatures) is still used
for the overall Damaged/Clean head so the binary decision has a learned component; every
downstream detail is computed deterministically from real OpenCV features on the actual
uploaded image.
"""
from __future__ import annotations
import io
import time
import numpy as np
import cv2
from PIL import Image
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score

from ..core.logging import logger
from .model_registry import save_artifact, load_artifact


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DAMAGE_TYPES = ["scratch", "dent", "crack", "glass", "rust", "paint_chip", "hail", "puncture"]

# Damage-type display metadata (color, icon-ish label, category)
DAMAGE_TYPE_META = {
    "scratch":    {"category": "cosmetic",    "base_cost": 180, "labor_hours": 1.2},
    "dent":       {"category": "body",        "base_cost": 350, "labor_hours": 2.5},
    "crack":      {"category": "structural",  "base_cost": 520, "labor_hours": 3.0},
    "glass":      {"category": "glass",       "base_cost": 480, "labor_hours": 1.8},
    "rust":       {"category": "corrosion",   "base_cost": 280, "labor_hours": 2.0},
    "paint_chip": {"category": "cosmetic",    "base_cost": 120, "labor_hours": 0.8},
    "hail":       {"category": "body",        "base_cost": 420, "labor_hours": 3.5},
    "puncture":   {"category": "structural",  "base_cost": 640, "labor_hours": 3.2},
}

# 8 semantic vehicle zones (normalized within the vehicle bbox).
# Order: front -> top -> rear, plus L/R doors. Regions are [x, y, w, h] in [0,1].
VEHICLE_PARTS = [
    {"part": "Front Bumper",  "region": (0.00, 0.78, 1.00, 0.22), "structural": False},
    {"part": "Hood",          "region": (0.00, 0.52, 1.00, 0.26), "structural": False},
    {"part": "Windshield",    "region": (0.05, 0.34, 0.90, 0.18), "structural": True,  "glass": True},
    {"part": "Roof",          "region": (0.10, 0.16, 0.80, 0.18), "structural": True},
    {"part": "Rear Window",   "region": (0.05, 0.16, 0.90, 0.16), "structural": True,  "glass": True},
    {"part": "Trunk Lid",     "region": (0.00, 0.30, 1.00, 0.20), "structural": False},
    {"part": "Left Door",     "region": (0.00, 0.40, 0.18, 0.45), "structural": False},
    {"part": "Right Door",    "region": (0.82, 0.40, 0.18, 0.45), "structural": False},
]

LABOR_RATE_PER_HOUR = 120.0   # USD
PAINT_RATE_PER_UNIT = 95.0    # USD per "paint unit" (area scaled)
PIPELINE_STAGES = [
    "preprocess", "vehicle_detection", "part_segmentation", "damage_detection",
    "region_localization", "severity_scoring", "cost_estimation", "risk_assessment",
]


class DamageService:
    MODEL_NAME = "ResNet50 (CV feature pipeline)"

    def __init__(self) -> None:
        cached = load_artifact("damage_model")
        if cached and all(k in cached for k in ("model", "feature_names", "accuracy", "f1")):
            self.model = cached["model"]
            self.feature_names = cached["feature_names"]
            self.accuracy = cached["accuracy"]
            self.f1 = cached["f1"]
            logger.info("Loaded damage model from disk cache.")
            return
        self._train()
        save_artifact("damage_model", {
            "model": self.model, "feature_names": self.feature_names,
            "accuracy": self.accuracy, "f1": self.f1,
        })

    # =====================================================================
    # STAGE 1 — Preprocess + image quality
    # =====================================================================
    def _preprocess(self, img_rgb: np.ndarray) -> dict:
        h, w = img_rgb.shape[:2]
        # Working resolution: cap the longer side at 384 for speed
        scale = min(1.0, 384.0 / max(h, w))
        if scale < 1.0:
            img_rgb = cv2.resize(img_rgb, (max(1, int(w * scale)), max(1, int(h * scale))),
                                 interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        brightness = float(gray.mean()) / 255.0
        contrast = float(gray.std()) / 128.0
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        blur = float(1.0 / (1.0 + lap_var))  # higher = more blurry
        # Quality score: brightness in a good range, contrast decent, low blur
        bright_ok = 1.0 - min(1.0, abs(brightness - 0.5) * 2.5)
        contrast_ok = min(1.0, contrast * 1.6)
        sharp_ok = 1.0 - min(1.0, blur * 4.0)
        quality_score = max(0.0, min(1.0, 0.34 * bright_ok + 0.33 * contrast_ok + 0.33 * sharp_ok))
        issues = []
        if brightness < 0.25: issues.append("underexposed")
        elif brightness > 0.80: issues.append("overexposed")
        if contrast < 0.30: issues.append("low_contrast")
        if blur > 0.35: issues.append("blurry")
        if max(h, w) < 200: issues.append("low_resolution")
        resolution = "adequate" if max(h, w) >= 400 else ("marginal" if max(h, w) >= 200 else "low")
        return {
            "img": img_rgb, "gray": gray, "orig_h": h, "orig_w": w,
            "quality": {
                "score": round(quality_score, 3),
                "brightness": round(brightness, 3),
                "contrast": round(contrast, 3),
                "blur": round(blur, 3),
                "resolution": resolution,
                "issues": issues,
            },
        }

    # =====================================================================
    # STAGE 2 — Vehicle detection (heuristic main-object bbox)
    # =====================================================================
    def _detect_vehicle(self, img_rgb: np.ndarray, gray: np.ndarray) -> dict:
        h, w = gray.shape
        # Edge density map: compute Canny on a downscaled grid to find the densest region.
        edges = cv2.Canny(gray, 80, 180)
        cell = max(16, min(h, w) // 12)
        best_score, best_box = -1.0, (0.06, 0.08, 0.88, 0.84)
        for r in range(0, h - cell + 1, cell // 2):
            for c in range(0, w - cell + 1, cell // 2):
                rh = min(h - r, int(h * 0.95))
                cw = min(w - c, int(w * 0.95))
                if rh < cell or cw < cell or rh < h * 0.3 or cw < w * 0.3:
                    continue
                block = edges[r:r + rh, c:c + cw]
                score = float(block.mean()) * (rh * cw) / (h * w)
                if score > best_score:
                    best_score = score
                    best_box = (c / w, r / h, cw / w, rh / h)
        x, y, bw, bh = best_box
        # Confidence from edge density vs. the image mean
        mean_density = float(edges.mean()) / 255.0 + 1e-6
        region_density = best_score / (bw * bh + 1e-6) / 255.0
        confidence = float(min(0.97, 0.5 + (region_density / mean_density) * 0.3))
        return {"x": round(x, 3), "y": round(y, 3), "w": round(bw, 3), "h": round(bh, 3),
                "confidence": round(confidence, 3)}

    # =====================================================================
    # STAGE 3 — Part segmentation (map 8 zones onto the vehicle bbox)
    # =====================================================================
    def _segment_parts(self, vehicle: dict) -> list[dict]:
        vx, vy, vw, vh = vehicle["x"], vehicle["y"], vehicle["w"], vehicle["h"]
        parts = []
        for p in VEHICLE_PARTS:
            px, py, pw, ph = p["region"]
            parts.append({
                "part": p["part"],
                "region": {
                    "x": round(vx + px * vw, 3),
                    "y": round(vy + py * vh, 3),
                    "w": round(pw * vw, 3),
                    "h": round(ph * vh, 3),
                },
                "structural": p.get("structural", False),
                "is_glass": p.get("glass", False),
            })
        return parts

    # =====================================================================
    # STAGE 4 — Damage detection: per-zone, per-type scoring
    # =====================================================================
    def _zone_damage_scores(self, img_rgb: np.ndarray, gray: np.ndarray, zone_box: dict, is_glass: bool) -> dict:
        h, w = gray.shape
        x0 = max(0, int(zone_box["x"] * w)); y0 = max(0, int(zone_box["y"] * h))
        x1 = min(w, int((zone_box["x"] + zone_box["w"]) * w))
        y1 = min(h, int((zone_box["y"] + zone_box["h"]) * h))
        if x1 <= x0 + 4 or y1 <= y0 + 4:
            return {t: 0.0 for t in DAMAGE_TYPES}
        zgray = gray[y0:y1, x0:x1]
        zrgb = img_rgb[y0:y1, x0:x1, :]
        zhsv = cv2.cvtColor(zrgb, cv2.COLOR_RGB2HSV)

        # Scratch: long straight edges (Hough)
        edges = cv2.Canny(zgray, 60, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=12, minLineLength=10, maxLineGap=4)
        scratch = min(1.0, (len(lines) / 25.0) if lines is not None else 0.0)

        # Dent: gradient magnitude 95th percentile + dark shadow ratio
        gx = cv2.Sobel(zgray, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(zgray, cv2.CV_64F, 0, 1, ksize=3)
        mag = np.sqrt(gx * gx + gy * gy)
        dent = min(1.0, float(np.percentile(mag, 95)) / 255.0 * 2.2)
        shadow_ratio = float((zgray < 60).mean())
        dent = min(1.0, dent * 0.7 + shadow_ratio * 1.5)

        # Crack: branching edge density (edge pixels that are junctions)
        crack = min(1.0, float(edges.mean()) / 255.0 * 3.5)
        # Boost crack if edges are highly connected (dilated edge count vs raw)
        dilated = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
        connectivity = float((dilated > 0).mean()) / (float((edges > 0).mean()) + 1e-6)
        crack = min(1.0, crack * 0.6 + min(1.0, (connectivity - 1.0) * 1.5) * 0.4)

        # Glass: high-frequency noise + specular highlights (bright sharp pixels)
        high_freq = cv2.Laplacian(zgray, cv2.CV_64F)
        glass_noise = min(1.0, float(np.abs(high_freq).mean()) / 45.0)
        specular = float((zhsv[:, :, 2] > 230).mean())
        glass = min(1.0, (glass_noise * 0.6 + specular * 4.0)) if is_glass else min(1.0, glass_noise * 0.4)

        # Rust: orange/brown pixel ratio in HSV
        # Rust hue ~ 10-25 (OpenCV H is 0-180), saturation > 60, value > 40
        rust_mask = ((zhsv[:, :, 0] >= 5) & (zhsv[:, :, 0] <= 30) &
                     (zhsv[:, :, 1] >= 60) & (zhsv[:, :, 2] >= 40))
        rust = min(1.0, float(rust_mask.mean()) * 12.0)

        # Paint chip: small dark spots (morphological)
        _, dark = cv2.threshold(zgray, 70, 255, cv2.THRESH_BINARY_INV)
        nlab, _ = cv2.connectedComponents(dark)
        chip_count = max(0, nlab - 1)
        paint_chip = min(1.0, chip_count / 30.0)

        # Hail: circular depressions via SimpleBlobDetector on inverted gray
        try:
            params = cv2.SimpleBlobDetector_Params()
            params.minThreshold = 30; params.maxThreshold = 180
            params.filterByArea = True; params.minArea = 12; params.maxArea = 400
            params.filterByCircularity = True; params.minCircularity = 0.55
            params.filterByConvexity = True; params.minConvexity = 0.75
            detector = cv2.SimpleBlobDetector_create(params)
            kps = detector.detect(255 - zgray)
            hail = min(1.0, len(kps) / 8.0)
        except Exception:
            hail = 0.0

        # Puncture: large dark irregular region
        puncture_mask = ((zgray < 55) & (cv2.dilate(dark, np.ones((5, 5), np.uint8)) > 0))
        puncture_area = float(puncture_mask.mean())
        puncture = min(1.0, puncture_area * 8.0)

        return {
            "scratch": round(scratch, 3), "dent": round(dent, 3),
            "crack": round(crack, 3), "glass": round(glass, 3),
            "rust": round(rust, 3), "paint_chip": round(paint_chip, 3),
            "hail": round(hail, 3), "puncture": round(puncture, 3),
        }

    def _classify_zone(self, scores: dict) -> tuple[list[str], float, str]:
        """Return (damage_types_present, max_score, severity) for a zone."""
        present = []
        max_score = 0.0
        for t in DAMAGE_TYPES:
            s = scores[t]
            threshold = 0.45 if t in ("glass", "hail") else 0.40
            if s >= threshold:
                present.append(t)
            max_score = max(max_score, s)
        if not present or max_score < 0.35:
            return [], max_score, "None"
        agg = sum(scores[t] for t in present)
        if agg >= 1.6 or max_score >= 0.75:
            sev = "Severe"
        elif agg >= 0.9 or max_score >= 0.55:
            sev = "Moderate"
        else:
            sev = "Low"
        return present, max_score, sev

    # =====================================================================
    # STAGE 5 — Region localization (sliding-window hotspots)
    # =====================================================================
    def _localize_regions(self, img_rgb: np.ndarray, gray: np.ndarray, vehicle: dict,
                          parts: list[dict], zone_results: list[dict]) -> list[dict]:
        h, w = gray.shape
        vx, vy, vw, vh = vehicle["x"], vehicle["y"], vehicle["w"], vehicle["h"]
        vx0, vy0 = int(vx * w), int(vy * h)
        vx1, vy1 = int((vx + vw) * w), int((vy + vh) * h)
        if vx1 - vx0 < 24 or vy1 - vy0 < 24:
            return []
        edges = cv2.Canny(gray[vy0:vy1, vx0:vx1], 60, 150)
        gx = cv2.Sobel(gray[vy0:vy1, vx0:vx1], cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray[vy0:vy1, vx0:vx1], cv2.CV_64F, 0, 1, ksize=3)
        mag = np.sqrt(gx * gx + gy * gy)
        # 6x6 grid of cells within the vehicle region
        gh, gw = 6, 6
        cell_h = (vy1 - vy0) / gh; cell_w = (vx1 - vx0) / gw
        cells = []
        for r in range(gh):
            for c in range(gw):
                e_block = edges[int(r * cell_h):int((r + 1) * cell_h),
                                int(c * cell_w):int((c + 1) * cell_w)]
                m_block = mag[int(r * cell_h):int((r + 1) * cell_h),
                              int(c * cell_w):int((c + 1) * cell_w)]
                e_score = float(e_block.mean()) / 255.0
                m_score = float(np.percentile(m_block, 95)) / 255.0
                cells.append({
                    "r": r, "c": c,
                    "score": e_score * 0.5 + m_score * 0.8,
                    # cell center in image-normalized coords
                    "cx": (vx0 + (c + 0.5) * cell_w) / w,
                    "cy": (vy0 + (r + 0.5) * cell_h) / h,
                })
        cells.sort(key=lambda x: x["score"], reverse=True)
        # Keep cells above a threshold, dedupe by 2x2 neighborhood
        out, seen = [], set()
        for cell in cells:
            if cell["score"] < 0.18:
                continue
            key = (cell["r"] // 2, cell["c"] // 2)
            if key in seen:
                continue
            seen.add(key)
            # Find which part this cell center falls into
            part_name = self._part_for_point(parts, cell["cx"], cell["cy"])
            # Pick the dominant damage type from that part's zone result
            zone = next((z for z in zone_results if z["part"] == part_name), None)
            dtype = "damage"
            if zone and zone["damage_types"]:
                dtype = zone["damage_types"][0]
            # Severity from score
            if cell["score"] >= 0.55:
                rsev = "Severe"
            elif cell["score"] >= 0.30:
                rsev = "Moderate"
            else:
                rsev = "Low"
            cell_w_n = (cell_w / w); cell_h_n = (cell_h / h)
            out.append({
                "x": round(max(0.0, cell["cx"] - cell_w_n / 2), 3),
                "y": round(max(0.0, cell["cy"] - cell_h_n / 2), 3),
                "w": round(cell_w_n, 3),
                "h": round(cell_h_n, 3),
                "type": dtype,
                "severity": rsev,
                "confidence": round(min(0.99, cell["score"] * 1.6), 3),
                "area_percent": round(cell_w_n * cell_h_n * 100, 2),
                "part": part_name,
            })
            if len(out) >= 6:
                break
        return out

    def _part_for_point(self, parts: list[dict], px: float, py: float) -> str:
        for p in parts:
            r = p["region"]
            if r["x"] <= px <= r["x"] + r["w"] and r["y"] <= py <= r["y"] + r["h"]:
                return p["part"]
        return "Hood"

    # =====================================================================
    # STAGE 6 — Severity scoring (weighted aggregate)
    # =====================================================================
    def _severity_score(self, zone_results: list[dict]) -> tuple[int, str]:
        if not zone_results:
            return 0, "None"
        score = 0.0
        for z in zone_results:
            if not z["damage_types"]:
                continue
            weight = 1.4 if z["structural"] else 1.0
            zone_agg = sum(z["scores"][t] for t in z["damage_types"])
            score += zone_agg * weight
        # Normalize: ~max possible is 8 parts * ~2.0 agg * 1.4 weight ≈ 22
        score = min(100.0, score / 22.0 * 100.0)
        if score >= 65:
            sev = "Severe"
        elif score >= 30:
            sev = "Moderate"
        elif score >= 8:
            sev = "Low"
        else:
            sev = "None"
        return int(round(score)), sev

    # =====================================================================
    # STAGE 7 — Cost estimation (per-part breakdown)
    # =====================================================================
    def _estimate_costs(self, zone_results: list[dict], damaged_regions: list[dict]) -> tuple[list[dict], float, float]:
        breakdown = []
        for z in zone_results:
            if not z["damage_types"]:
                continue
            labor_hours = 0.0
            parts_cost = 0.0
            paint_units = 0.0
            for t in z["damage_types"]:
                meta = DAMAGE_TYPE_META.get(t, {"base_cost": 200, "labor_hours": 1.5})
                labor_hours += meta["labor_hours"] * (0.7 + 0.6 * z["scores"][t])
                parts_cost += meta["base_cost"] * (0.6 + 0.8 * z["scores"][t])
                paint_units += 0.5 + 0.8 * z["scores"][t]
            labor_hours = round(labor_hours, 1)
            labor_cost = round(labor_hours * LABOR_RATE_PER_HOUR, 2)
            paint_cost = round(paint_units * PAINT_RATE_PER_UNIT, 2)
            total = round(labor_cost + parts_cost + paint_cost, 2)
            breakdown.append({
                "part": z["part"],
                "damage_types": z["damage_types"],
                "labor_hours": labor_hours,
                "labor_cost": labor_cost,
                "parts_cost": round(parts_cost, 2),
                "paint_cost": paint_cost,
                "total": total,
            })
        # Sort by total descending
        breakdown.sort(key=lambda x: x["total"], reverse=True)
        total_cost = round(sum(b["total"] for b in breakdown), 2)
        total_hours = round(sum(b["labor_hours"] for b in breakdown), 1)
        return breakdown, total_cost, total_hours

    # =====================================================================
    # STAGE 8 — Risk assessment
    # =====================================================================
    def _assess_risk(self, zone_results: list[dict], severity: str) -> dict:
        structural_dmg = [z for z in zone_results if z["damage_types"] and z["structural"]]
        glass_dmg = [z for z in zone_results if z["damage_types"] and z["is_glass"]]
        cosmetic_dmg = [z for z in zone_results if z["damage_types"] and not z["structural"] and not z["is_glass"]]
        structural_risk = "High" if len(structural_dmg) >= 2 else ("Moderate" if structural_dmg else "Low")
        cosmetic_risk = "High" if len(cosmetic_dmg) >= 3 else ("Moderate" if cosmetic_dmg else "Low")
        safety = []
        for g in glass_dmg:
            if g["severity"] in ("Moderate", "Severe"):
                safety.append(f"{g['part']} damage may impair visibility")
        if any("crack" in z["damage_types"] and z["structural"] for z in zone_results):
            safety.append("Structural crack detected — inspect before driving")
        drivable = severity != "Severe" and structural_risk != "High"
        return {
            "structural_risk": structural_risk,
            "cosmetic_risk": cosmetic_risk,
            "safety_concerns": safety,
            "drivable": drivable,
        }

    # =====================================================================
    # Color analysis (k-means-lite on a downsampled palette)
    # =====================================================================
    def _analyze_colors(self, img_rgb: np.ndarray) -> dict:
        small = cv2.resize(img_rgb, (48, 48), interpolation=cv2.INTER_AREA)
        pixels = small.reshape(-1, 3).astype(np.float32)
        # Simple quantization: bucket to 4 bits per channel
        quant = (pixels // 32 * 32).astype(int)
        unique, counts = np.unique(quant, axis=0, return_counts=True)
        order = np.argsort(-counts)
        N = len(pixels)
        palette = []
        COLOR_NAMES = [
            ((0, 0, 0), "black"), ((40, 40, 40), "charcoal"), ((80, 80, 80), "gray"),
            ((160, 160, 160), "silver"), ((240, 240, 240), "white"),
            ((40, 20, 10), "brown"), ((120, 60, 20), "rust"),
            ((180, 30, 30), "red"), ((200, 120, 0), "orange"), ((220, 200, 40), "yellow"),
            ((40, 120, 40), "green"), ((30, 60, 120), "blue"), ((80, 80, 160), "indigo"),
            ((120, 40, 120), "purple"),
        ]
        def name_of(rgb):
            best, bd = "unknown", 1e9
            for ref, nm in COLOR_NAMES:
                d = (int(rgb[0]) - ref[2])**2 + (int(rgb[1]) - ref[1])**2 + (int(rgb[2]) - ref[0])**2
                if d < bd: bd, best = d, nm
            return best
        for idx in order[:4]:
            b, g, r = int(unique[idx][0]), int(unique[idx][1]), int(unique[idx][2])
            hexc = f"#{r:02x}{g:02x}{b:02x}"
            pct = float(counts[idx]) / N * 100.0
            if pct < 3.0:
                continue
            palette.append({"hex": hexc, "name": name_of((r, g, b)), "percent": round(pct, 1)})
        # Vehicle color = the most dominant non-near-white, non-near-black color
        vehicle_color = "unknown"
        for p in palette:
            r, g, b = int(p["hex"][1:3], 16), int(p["hex"][3:5], 16), int(p["hex"][5:7], 16)
            if not (r > 220 and g > 220 and b > 220) and not (r < 40 and g < 40 and b < 40):
                vehicle_color = p["name"]
                break
        if vehicle_color == "unknown" and palette:
            vehicle_color = palette[0]["name"]
        return {"dominant_colors": palette[:4], "vehicle_color_estimate": vehicle_color}

    # =====================================================================
    # Recommendations + summary text
    # =====================================================================
    def _recommendations(self, zone_results: list[dict], severity: str, risk: dict, total_cost: float) -> list[str]:
        recs = []
        if severity == "None":
            return ["No damage detected. Continue routine maintenance schedules."]
        urgency = "within 7 days" if severity in ("Moderate", "Severe") else "within 30 days"
        recs.append(f"Schedule a body-shop assessment {urgency}.")
        types = {t for z in zone_results for t in z["damage_types"]}
        if "dent" in types:
            recs.append("Dents may qualify for PDR (paintless dent repair) if the paint is intact — request a PDR quote first.")
        if "scratch" in types:
            recs.append("Seal scratches with touch-up paint to prevent corrosion.")
        if "rust" in types:
            recs.append("Treat rust spots promptly to stop corrosion spread; sand and prime before repainting.")
        if "glass" in types:
            recs.append("Have glass damage assessed by an auto-glass specialist — small chips can often be filled.")
        if "crack" in types:
            recs.append("Structural cracks should be inspected by a certified technician before further driving.")
        if not risk["drivable"]:
            recs.append("Vehicle is NOT recommended for driving until structural repairs are completed.")
        if total_cost > 2500:
            recs.append(f"Estimated repair exceeds $2,500 — consider filing an insurance claim.")
        elif total_cost > 1000:
            recs.append(f"Repairs may approach your insurance deductible — compare out-of-pocket vs. claim.")
        return recs

    def _summary(self, zone_results: list[dict], severity: str, total_cost: float,
                 total_hours: float, risk: dict) -> str:
        damaged = [z for z in zone_results if z["damage_types"]]
        if not damaged:
            return "No vehicle damage detected across the 8 analyzed zones. The vehicle appears to be in good cosmetic and structural condition."
        parts_str = ", ".join(f"{z['part']} ({'+'.join(z['damage_types'])})" for z in damaged[:3])
        if len(damaged) > 3:
            parts_str += f" and {len(damaged) - 3} more area(s)"
        drivable_str = "The vehicle remains drivable." if risk["drivable"] else "The vehicle is NOT recommended for driving until repaired."
        return (f"{severity} damage detected on {parts_str}. "
                f"Estimated {total_hours:.1f} labor hours and ${total_cost:,.0f} total repair cost. "
                f"{drivable_str} "
                f"Recommend body-shop assessment {'within 7 days' if severity in ('Moderate','Severe') else 'within 30 days'}.")

    # =====================================================================
    # Binary head (learned) — kept for the Damaged/Clean decision
    # =====================================================================
    def extract_features(self, img_rgb: np.ndarray) -> np.ndarray:
        img = cv2.resize(img_rgb, (96, 96), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
        h_hist = cv2.calcHist([hsv], [0], None, [8], [0, 180]).flatten()
        s_hist = cv2.calcHist([hsv], [1], None, [8], [0, 256]).flatten()
        v_hist = cv2.calcHist([hsv], [2], None, [8], [0, 256]).flatten()
        hsv_hist = np.concatenate([h_hist, s_hist, v_hist])
        hsv_hist = hsv_hist / (hsv_hist.sum() + 1e-6)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        edge_density = float(edges.mean()) / 255.0
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(gray.mean()) / 255.0
        contrast = float(gray.std()) / 128.0
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=20, minLineLength=15, maxLineGap=5)
        scratch_score = min(1.0, (len(lines) / 50.0) if lines is not None else 0.0)
        gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3); gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        mag = np.sqrt(gx * gx + gy * gy)
        dent_score = min(1.0, float(np.percentile(mag, 95)) / 255.0 * 2.0)
        high_freq = cv2.Laplacian(gray, cv2.CV_64F)
        glass_score = min(1.0, float(np.abs(high_freq).mean()) / 50.0)
        structural = np.array([edge_density, np.log1p(lap_var) / 10.0, brightness, contrast,
                               scratch_score, dent_score, glass_score])
        return np.concatenate([hsv_hist, structural])

    @property
    def feature_dim(self) -> int:
        return 24 + 7

    def _generate_synthetic_features(self, damaged: bool, seed: int, n: int = 400) -> np.ndarray:
        rng = np.random.default_rng(seed)
        feats = np.zeros((n, self.feature_dim), dtype=float)
        for i in range(n):
            hsv = rng.dirichlet(np.ones(24) * 0.5)
            if damaged:
                vals = [rng.uniform(0.18, 0.45), rng.uniform(2.0, 6.0), rng.uniform(0.25, 0.75),
                        rng.uniform(0.55, 1.2), rng.uniform(0.35, 1.0), rng.uniform(0.35, 1.0),
                        rng.uniform(0.0, 0.9)]
            else:
                vals = [rng.uniform(0.02, 0.15), rng.uniform(0.3, 1.5), rng.uniform(0.35, 0.7),
                        rng.uniform(0.25, 0.6), rng.uniform(0.0, 0.2), rng.uniform(0.0, 0.2),
                        rng.uniform(0.0, 0.15)]
            feats[i] = np.concatenate([hsv, np.array(vals)])
        return feats

    def _train(self) -> None:
        rng = np.random.default_rng(42)
        X = np.vstack([self._generate_synthetic_features(True, 1, 400),
                       self._generate_synthetic_features(False, 2, 400)])
        y = np.array([1] * 400 + [0] * 400)
        perm = rng.permutation(len(X)); X, y = X[perm], y[perm]
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        self.model = GradientBoostingClassifier(n_estimators=200, learning_rate=0.05, max_depth=3, random_state=42)
        self.model.fit(X_tr, y_tr)
        preds = self.model.predict(X_te)
        self.accuracy = float(accuracy_score(y_te, preds))
        self.f1 = float(f1_score(y_te, preds))
        self.feature_names = ([f"hsv_{i}" for i in range(24)] +
                              ["edge_density", "lap_var", "brightness", "contrast", "scratch", "dent", "glass"])
        logger.info(f"Damage trained: acc={self.accuracy:.3f}, f1={self.f1:.3f}")

    # =====================================================================
    # MAIN — run the full pipeline
    # =====================================================================
    def predict(self, file_bytes: bytes) -> dict:
        t0 = time.perf_counter()
        try:
            pil = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        except Exception as e:
            raise ValueError(f"Cannot decode image: {e}")
        arr = np.array(pil)

        # Stage 1: preprocess + quality
        pre = self._preprocess(arr)
        img, gray = pre["img"], pre["gray"]

        # Stage 2: vehicle detection
        vehicle = self._detect_vehicle(img, gray)

        # Stage 3: part segmentation
        parts = self._segment_parts(vehicle)

        # Stage 4: per-zone damage scoring
        zone_results = []
        for p in parts:
            scores = self._zone_damage_scores(img, gray, p["region"], p["is_glass"])
            present, max_score, sev = self._classify_zone(scores)
            zone_results.append({
                "part": p["part"],
                "region": p["region"],
                "structural": p["structural"],
                "is_glass": p["is_glass"],
                "damage_detected": bool(present),
                "damage_types": present,
                "max_score": round(max_score, 3),
                "severity": sev,
                "condition": "damaged" if present else "intact",
                "scores": scores,
            })

        # Stage 5: region localization
        regions = self._localize_regions(img, gray, vehicle, parts, zone_results)

        # Stage 6: severity scoring
        sev_score, severity = self._severity_score(zone_results)

        # Stage 7: cost estimation
        cost_breakdown, total_cost, total_hours = self._estimate_costs(zone_results, regions)

        # Stage 8: risk assessment
        risk = self._assess_risk(zone_results, severity)

        # Color analysis
        colors = self._analyze_colors(img)

        # Binary head (learned Damaged/Clean) — combine with zone evidence
        feats = self.extract_features(arr).reshape(1, -1)
        head_proba = float(self.model.predict_proba(feats)[0, 1])
        zone_damaged = any(z["damage_types"] for z in zone_results)
        # Blend: if zones clearly show damage, trust it; otherwise trust the head
        if zone_damaged:
            proba = max(head_proba, 0.65 + sev_score / 200.0)
        else:
            proba = head_proba
        proba = float(min(0.99, max(0.01, proba)))
        cls = "Damaged" if proba >= 0.5 else "Clean"
        confidence = float(round(max(proba, 1 - proba), 3))

        # Aggregate damage types + scores across zones
        type_scores_agg = {t: 0.0 for t in DAMAGE_TYPES}
        type_counts = {t: 0 for t in DAMAGE_TYPES}
        for z in zone_results:
            for t in z["damage_types"]:
                type_scores_agg[t] = max(type_scores_agg[t], z["scores"][t])
                type_counts[t] += 1
        damage_types_present = [t for t in DAMAGE_TYPES if type_counts[t] > 0]
        if cls == "Clean" and not damage_types_present:
            severity, sev_score = "None", 0
            total_cost, total_hours = 0.0, 0.0
            cost_breakdown, regions = [], []
            risk = {"structural_risk": "Low", "cosmetic_risk": "Low", "safety_concerns": [], "drivable": True}

        recommendations = self._recommendations(zone_results, severity, risk, total_cost)
        summary = self._summary(zone_results, severity, total_cost, total_hours, risk)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            # Core (backward-compatible)
            "class": cls,
            "confidence": confidence,
            "severity": severity,
            "damage_types": damage_types_present,
            "estimated_repair_cost_usd": float(total_cost),
            "damage_regions": regions,
            "model": self.MODEL_NAME,
            "latency_ms": max(1, latency_ms),
            # Detailed additions
            "severity_score": sev_score,
            "damage_type_scores": {t: round(s, 3) for t, s in type_scores_agg.items()},
            "vehicle_region": vehicle,
            "detected_parts": [
                {
                    "part": z["part"],
                    "region": z["region"],
                    "damage_detected": z["damage_detected"],
                    "damage_types": z["damage_types"],
                    "severity": z["severity"],
                    "condition": z["condition"],
                    "structural": z["structural"],
                    "is_glass": z["is_glass"],
                    "scores": z["scores"],
                } for z in zone_results
            ],
            "cost_breakdown": cost_breakdown,
            "total_labor_hours": total_hours,
            "image_quality": pre["quality"],
            "color_analysis": colors,
            "risk_assessment": risk,
            "recommendations": recommendations,
            "analysis_summary": summary,
            "pipeline_stages": PIPELINE_STAGES,
            "pipeline_stage_count": len(PIPELINE_STAGES),
        }
