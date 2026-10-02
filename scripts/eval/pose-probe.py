#!/usr/bin/env python3
"""Pose probe: does a measured skeleton separate the remaining big misses?

Three rounds of single-frame yes/no cues (E50-E58) could not catch shot-198
(flared elbow), shot-202 (two-hand V) or avoid shot-187 (one-hand shot read
as a V) without capping good shots. This asks a pose model instead: MediaPipe
PoseLandmarker on the re-extracted frames, cropped to the cached shooter box,
and reports geometry at the set point (frames R-4..R-1, R = 18 in the
re-extract window) against the expert's Elbow band for every fixture.

No API cost. Usage:
  python3 scripts/eval/pose-probe.py [model.task] [--frames .eval-reextract] [--json out.json]
"""
import json, os, sys, math, statistics as st
import cv2, numpy as np
import mediapipe as mp
LEGACY = hasattr(mp, 'solutions') and hasattr(mp.solutions, 'pose')
if not LEGACY:
    from mediapipe.tasks.python import vision, BaseOptions

args = sys.argv[1:]
MODEL = next((a for a in args if a.endswith('.task')), 'scripts/eval/pose_landmarker_heavy.task')
FRAMES = args[args.index('--frames') + 1] if '--frames' in args else '.eval-reextract'
OUT = args[args.index('--json') + 1] if '--json' in args else None
R = 18
SETPOINT = [R - 4, R - 3, R - 2, R - 1]
MARGIN_X, MARGIN_Y = 0.08, 0.12

boxes = json.load(open('scripts/eval/crop-boxes.json'))
e54 = json.load(open('.eval-arms/e54.json'))

def band(slug, crit):
    for c in e54['cells']:
        if c['fixture'] == slug and c['criterion'] == crit and c.get('source') == 'expert' and isinstance(c['expected'], list):
            return c['expected']
    return None

if LEGACY:
    # mediapipe 0.10.x: bundled model, CPU inference, no Metal helper (1.0.x
    # crashes on macOS with "Service is unavailable" even on the CPU delegate).
    pose = mp.solutions.pose.Pose(static_image_mode=True, model_complexity=2, min_detection_confidence=0.3)
    def detect(rgb):
        res = pose.process(rgb)
        return res.pose_landmarks.landmark if res.pose_landmarks else None
else:
    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL, delegate=BaseOptions.Delegate.CPU),
        running_mode=vision.RunningMode.IMAGE, num_poses=1,
        min_pose_detection_confidence=0.3, min_pose_presence_confidence=0.3,
    )
    landmarker = vision.PoseLandmarker.create_from_options(options)
    def detect(rgb):
        res = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        return res.pose_landmarks[0] if res.pose_landmarks else None

# Landmark indices (person's own left/right).
NOSE, L_EAR, R_EAR = 0, 7, 8
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP = 11, 12, 13, 14, 15, 16, 23, 24

def crop(img, slug):
    h, w = img.shape[:2]
    b = boxes.get(slug)
    if not b or b.get('x0') is None:
        return img
    x0 = max(0.0, b['x0'] - MARGIN_X); y0 = max(0.0, b['y0'] - MARGIN_Y)
    x1 = min(1.0, b['x1'] + MARGIN_X); y1 = min(1.0, b['y1'] + MARGIN_Y)
    return img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]

def angle(a, b, c):
    """Angle at b (degrees) between ba and bc."""
    v1 = (a[0] - b[0], a[1] - b[1]); v2 = (c[0] - b[0], c[1] - b[1])
    n1 = math.hypot(*v1); n2 = math.hypot(*v2)
    if n1 == 0 or n2 == 0:
        return None
    cosang = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.degrees(math.acos(cosang))

def frame_metrics(img):
    """Geometry of one cropped frame, or None when no pose is found."""
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    lm = detect(rgb)
    if lm is None:
        return None
    P = lambda i: (lm[i].x, lm[i].y)
    V = lambda i: lm[i].visibility
    sh_mid = ((lm[L_SH].x + lm[R_SH].x) / 2, (lm[L_SH].y + lm[R_SH].y) / 2)
    hip_mid = ((lm[L_HIP].x + lm[R_HIP].x) / 2, (lm[L_HIP].y + lm[R_HIP].y) / 2)
    torso = math.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1]) or 1e-6
    shoulder_w = abs(lm[L_SH].x - lm[R_SH].x) or 1e-6
    arms = {}
    for side, (s, e, w) in {'L': (L_SH, L_EL, L_WR), 'R': (R_SH, R_EL, R_WR)}.items():
        # Outward = away from the body's midline, in shoulder widths.
        outward = (lm[e].x - lm[s].x) * (1 if lm[s].x >= sh_mid[0] else -1) / shoulder_w
        arms[side] = {
            'elbow_angle': angle(P(s), P(e), P(w)),
            'elbow_above_shoulder': (lm[s].y - lm[e].y) / torso,   # +: elbow higher than its shoulder
            'elbow_outward': outward,                               # +: elbow outside the shoulder line
            'wrist_above_nose': (lm[NOSE].y - lm[w].y) / torso,     # +: hand above the head
            'wrist_x_from_mid': (lm[w].x - sh_mid[0]) / shoulder_w, # side of the body the hand is on
            'vis': min(V(s), V(e), V(w)),
        }
    return {'arms': arms, 'torso': torso, 'shoulder_w': shoulder_w, 'nose_vis': V(NOSE)}

def analyse(slug):
    """Scan every frame; the SET POINT is derived from the skeleton, not assumed.
    Extension frame E = first frame where the shooting elbow opens past 150 deg
    with the wrist above the nose (the arm going up to release). Set point =
    the four frames before E. Fixed offsets from a guessed release put a
    third of the fixtures past the release or still in the dip."""
    per = {}
    for i in range(28):
        path = os.path.join(FRAMES, slug, f'{i:02d}.jpg')
        if not os.path.exists(path):
            continue
        img = cv2.imread(path)
        if img is None:
            continue
        m = frame_metrics(crop(img, slug))
        if m:
            per[i] = m
    if not per:
        return {'slug': slug, 'detected': 0}
    # Shooting arm: the wrist that reaches highest over the whole clip.
    peak = {side: max(f['arms'][side]['wrist_above_nose'] for f in per.values()) for side in 'LR'}
    shoot = 'L' if peak['L'] >= peak['R'] else 'R'
    guide = 'R' if shoot == 'L' else 'L'
    E = None
    for i in sorted(per):
        a = per[i]['arms'][shoot]
        if a['elbow_angle'] is not None and a['elbow_angle'] > 150 and a['wrist_above_nose'] > 0:
            E = i
            break
    if E is None:
        E = max(per)
    sp_idx = [i for i in range(E - 4, E) if i in per]
    sp = [per[i] for i in sp_idx]
    med = lambda key, side: st.median([f['arms'][side][key] for f in sp if f['arms'][side][key] is not None]) if sp else None
    out = {
        'slug': slug, 'detected': len(per), 'extension_frame': E, 'setpoint_frames': sp_idx, 'shooting_arm': shoot,
        'elbow_angle': med('elbow_angle', shoot),
        'elbow_above_shoulder': med('elbow_above_shoulder', shoot),
        'elbow_outward': med('elbow_outward', shoot),
        'wrist_above_nose': med('wrist_above_nose', shoot),
        'guide_wrist_above_nose': med('wrist_above_nose', guide),
        'guide_elbow_outward': med('elbow_outward', guide),
        'wrist_gap': None if not sp else st.median([abs(f['arms']['L']['wrist_above_nose'] - f['arms']['R']['wrist_above_nose']) for f in sp]),
        'arm_vis': med('vis', shoot),
    }
    out['two_hand'] = bool(sp) and out['guide_wrist_above_nose'] is not None and out['guide_wrist_above_nose'] > 0 and out['wrist_gap'] < 0.15 and out['guide_elbow_outward'] > 0.3 and out['elbow_outward'] > 0.3
    return out

slugs = sorted(d for d in os.listdir(FRAMES) if d.startswith('shot-'))
rows = []
for slug in slugs:
    r = analyse(slug)
    r['elbow_band'] = band(slug, 'Elbow L-Shape — Under the Ball')
    r['onehand_band'] = band(slug, 'Shooting Through Guide Hand / One Hand Release')
    rows.append(r)
    eb = r['elbow_band']
    f = lambda k, w=6, p=2: ('%*.*f' % (w, p, r[k])) if r.get(k) is not None else ' ' * (w - 1) + '-'
    print(f"{slug:9} det {r.get('detected',0):2}/28 E {str(r.get('extension_frame','-')):>2} sp {str(r.get('setpoint_frames',''))[:16]:16} arm {r.get('shooting_arm','-')} "
          f"angle {f('elbow_angle',6,0)}  elb_above {f('elbow_above_shoulder')}  elb_out {f('elbow_outward')}  "
          f"wrist_up {f('wrist_above_nose')}  guide_up {f('guide_wrist_above_nose')}  gap {f('wrist_gap')}  "
          f"two_hand {str(r.get('two_hand', False)):5}  vis {f('arm_vis',4,2)}  | Elbow exp {eb if eb else '-'}")

# Rank correlation of each metric with the expert Elbow band midpoint.
def spearman(xs, ys):
    n = len(xs)
    if n < 4:
        return None
    rk = lambda v: [sorted(v).index(x) + 1 for x in v]
    rx, ry = rk(xs), rk(ys)
    d2 = sum((a - b) ** 2 for a, b in zip(rx, ry))
    return 1 - 6 * d2 / (n * (n * n - 1))

print('\nSpearman rank correlation with the expert Elbow band midpoint (higher band = better elbow):')
for key in ['elbow_angle', 'elbow_above_shoulder', 'elbow_outward', 'wrist_above_nose', 'guide_wrist_above_nose', 'wrist_gap']:
    pairs = [(r[key], (r['elbow_band'][0] + r['elbow_band'][1]) / 2) for r in rows if r.get(key) is not None and r['elbow_band']]
    rho = spearman([p[0] for p in pairs], [p[1] for p in pairs])
    print(f"  {key:24} n={len(pairs):2}  rho={rho:+.2f}" if rho is not None else f"  {key:24} n={len(pairs)} (too few)")

if OUT:
    json.dump(rows, open(OUT, 'w'), indent=1)
    print(f'\nwrote {OUT}')
