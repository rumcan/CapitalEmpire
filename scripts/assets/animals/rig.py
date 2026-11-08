"""T309: the pose of an animal on its aligned model (model frame: u forward, v lateral, z up from the hooves).
The front end is a chain of three bones (the neck's lower half, its upper half, the head), skinned by linear blending between the cuts at the
joints, so the neck arcs instead of folding at one hinge; the neck can lengthen (the muzzle reaches the grass) and the whole front can sink (the
front legs give: z' = z - drop(u) min(1, z / belly)). Legs swing about the shoulder and the hip (a four-beat walk) and the foot lifts as it swings;
the tail swishes about the long axis. Splats are moved and their covariances turned by the weights' blended angle.
Joints are read off the side views (grid_side.py) and kept in JOINTS."""
import math
from common import *
import numpy as np, torch

# per animal (model-frame (u, z) points of the aligned model; the ground is z = 0): J0 the neck's base (the middle of its cut), a0 the angle of the cut's
# normal (degrees up from +u: the cut runs from the withers' foot to where the neck's underside meets the chest), J2 the poll (where the head meets the
# neck), M the muzzle's tip; hw the half widths of the three cuts' blend zones. GRAZE: how far the front sinks and the neck lengthens to reach the grass.
JOINTS = {
    'horse-bay': dict(J0=(0.155, 0.64), a0=33, J2=(0.34, 0.835), M=(0.50, 0.714), hw=(0.05, 0.05, 0.04)),
    'horse-chestnut': dict(J0=(0.22, 0.61), a0=33, J2=(0.34, 0.84), M=(0.525, 0.72), hw=(0.06, 0.05, 0.04)),
    'horse-grey': dict(J0=(0.15, 0.62), a0=33, J2=(0.34, 0.83), M=(0.50, 0.70), hw=(0.05, 0.05, 0.04)),
    'cow-holstein': dict(J0=(0.23, 0.62), a0=19, J2=(0.375, 0.69), M=(0.62, 0.65), hw=(0.08, 0.06, 0.05)),
    'cow-brown': dict(J0=(0.25, 0.60), a0=19, J2=(0.38, 0.72), M=(0.595, 0.66), hw=(0.08, 0.06, 0.05)),
    # a sheep's neck is the wool collar: the pivot sits at the withers inside the wool, the cut is nearly horizontal (the chest keeps its wool); the belly
    # is the wool's lower edge (the legs below it are all that swings)
    'sheep-white': dict(J0=(0.22, 0.62), a0=60, J2=(0.40, 0.84), M=(0.55, 0.78), hw=(0.07, 0.05, 0.04), belly=0.22),
    'sheep-blackface': dict(J0=(0.22, 0.64), a0=60, J2=(0.37, 0.86), M=(0.53, 0.69), hw=(0.07, 0.05, 0.04), belly=0.26),
}
# the grazing pose: how far the front sinks and the neck lengthens, and the muzzle's height above the grass (in body heights) it aims for
GRAZE = {'horse': dict(drop=0.07, sigma=0.25, target=0.14), 'cow': dict(drop=0.08, sigma=0.28, target=0.14), 'sheep': dict(drop=0.10, sigma=0.8, target=0.14)}
INFLATE = 0.7  # how much the splats grow where the neck's bend stretches them (per radian of the bend, at the middle of a cut's blend zone)


def kind_of(iid): return iid.split('-')[0]


def smooth(x):
    x = x.clamp(0, 1); return x * x * (3 - 2 * x)


def rot_lateral(ang):
    """per-splat rotations about the lateral axis v: (n, 3, 3); positive turns +u down"""
    c, s = torch.cos(ang), torch.sin(ang); z, o = torch.zeros_like(ang), torch.ones_like(ang)
    return torch.stack([c, z, s, z, o, z, -s, z, c], 1).view(-1, 3, 3)


def rot_long(ang):
    """per-splat rotations about the long axis u (the tail's swish)"""
    c, s = torch.cos(ang), torch.sin(ang); z, o = torch.zeros_like(ang), torch.ones_like(ang)
    return torch.stack([o, z, z, z, c, -s, z, s, c], 1).view(-1, 3, 3)


def rot2(a):
    """2D rotation (du, dz) -> (c du + s dz, -s du + c dz): positive = head down"""
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, s], [-s, c]])


class Pose:
    def __init__(self, M):
        self.M = M; J = JOINTS[M.id]; self.J = J
        self.p, self.cov = M.p, M.cov
        p = self.p; u, z = p[:, 0], p[:, 2]
        P = p[M.op > 0.5]; Pn = P.cpu().numpy(); L = M.L; self.h = M.h; self.L = L
        # the body: belly height (the lowest height where splats cover over 55% of the middle 70% of the length), shoulder and hip
        cells = 40; belly = None
        for zb in np.arange(0.05, 0.8, 0.01) * self.h:
            band = Pn[(Pn[:, 2] > zb) & (Pn[:, 2] < zb + 0.02 * self.h) & (np.abs(Pn[:, 0]) < 0.35 * L)]
            if len(band) < 20: continue
            if len(np.unique(np.floor((band[:, 0] + 0.35 * L) / (0.7 * L) * cells))) > 0.55 * cells: belly = zb; break
        self.belly = J.get('belly', belly if belly is not None else 0.45 * self.h)
        legs = Pn[Pn[:, 2] < 0.6 * self.belly]
        self.u_front = float(np.median(legs[legs[:, 0] > 0][:, 0])) if (legs[:, 0] > 0).any() else 0.3 * L
        self.u_back = float(np.median(legs[legs[:, 0] <= 0][:, 0])) if (legs[:, 0] <= 0).any() else -0.3 * L
        # ---- the neck chain: cuts at J0 (explicit normal), J1 (the middle) and J2 (the poll), blend zones hw
        J0, J2, Mz = np.array(J['J0'], dtype=np.float64), np.array(J['J2'], dtype=np.float64), np.array(J['M'], dtype=np.float64); J1 = (J0 + J2) / 2
        self.Jr = [J0, J1, J2]; self.Mz = Mz
        e0, e1, hd = J1 - J0, J2 - J1, Mz - J2
        self.len = [float(np.linalg.norm(e0)), float(np.linalg.norm(e1)), float(np.linalg.norm(hd))]
        d0, d1, dh = e0 / self.len[0], e1 / self.len[1], hd / self.len[2]
        a0 = math.radians(J['a0']); n0 = np.array([math.cos(a0), math.sin(a0)])
        n1 = d0 + d1; n1 /= np.linalg.norm(n1); n2 = d1 + dh; n2 /= np.linalg.norm(n2)
        self.n = [n0, n1, n2]; hw = J['hw']; s = []
        for k in range(3):
            d = (u - float(self.Jr[k][0])) * float(self.n[k][0]) + (z - float(self.Jr[k][1])) * float(self.n[k][1])
            s.append(smooth((d + hw[k]) / (2 * hw[k])))
        self.s = s
        self.w = [1 - s[0], s[0] * (1 - s[1]), s[0] * s[1] * (1 - s[2]), s[0] * s[1] * s[2]]  # body, neck lower, neck upper, head
        self.dirs = [d0, d1, dh]
        # ---- the legs: front/back halves split at the middle of shoulder and hip, left/right by v; weight 1 low on the leg, 0 at the belly
        mid = (self.u_front + self.u_back) / 2
        self.front = u > mid; self.left = p[:, 1] > 0
        wl = ((self.belly * 1.02 - z) / (0.3 * self.belly)).clamp(0, 1); self.w_leg = wl * wl * (3 - 2 * wl)
        self.pivot_z = self.belly * 1.05
        self.w_foot = (((0.55 * self.belly - z) / (0.45 * self.belly)).clamp(0, 1)) ** 2
        # ---- the tail: behind the hindquarters, near the midline, below the rump's top
        u_min = float(torch.quantile(P[:, 0], 0.005)); vw = float(torch.quantile(P[:, 1], 0.98) - torch.quantile(P[:, 1], 0.02))
        rump = P[P[:, 0] < u_min + 0.15 * L]
        self.tail_z = float(torch.quantile(rump[:, 2], 0.9)) * 0.92 if len(rump) else 0.8 * self.h
        wu = ((u_min + 0.075 * L - u) / (0.035 * L)).clamp(0, 1); wu = wu * wu * (3 - 2 * wu)
        wv = (1 - (p[:, 1].abs() / (0.3 * vw)).clamp(0, 1)); wz = ((self.tail_z - z) / (0.45 * self.tail_z)).clamp(0, 1)
        self.w_tail = wu * wv * wz * (z > 0.06 * self.h).float()

    # ---------------------------------------------------------------- the front end
    def chain(self, th, sigma):
        """joints of the posed chain (2D, (u, z)): th = (neck lower, neck upper, head) turns in radians (each added to the one before), sigma the
        neck's lengthening. Returns the posed joints [J0, J1', J2'], the bones' cumulative angles and the muzzle"""
        J0 = self.Jr[0]; ang = [th[0], th[0] + th[1], th[0] + th[1] + th[2]]
        j1 = J0 + rot2(ang[0]) @ (self.dirs[0] * self.len[0] * (1 + sigma))
        j2 = j1 + rot2(ang[1]) @ (self.dirs[1] * self.len[1] * (1 + sigma))
        m = j2 + rot2(ang[2]) @ (self.dirs[2] * self.len[2])
        return [J0, j1, j2], ang, m

    def solve_graze(self, drop, sigma, head_abs=(-86.0, -64.0), target=0.045):
        """the neck's and head's turns that bring the muzzle to the grass (z = target h after the front's sinking): the head ends pointing between
        head_abs degrees below horizontal (steep, but never tucked under the chin). Returns (th, muzzle z, neck turn degrees, head direction degrees)"""
        best = None
        dh = math.degrees(math.atan2(self.dirs[2][1], self.dirs[2][0]))
        for t0 in np.radians(np.arange(10, 136, 2.0)):
            for hd in np.arange(head_abs[0], head_abs[1] + 0.1, 3.0):
                # the head's absolute direction after the chain's turns = dh - (t0 + th2)  =>  th2 = dh - hd - t0 (in degrees, then radians)
                th2 = math.radians(dh - hd) - t0
                th = (t0 * 0.6, t0 * 0.4, th2)
                J, ang, m = self.chain(th, sigma)
                z = m[1] - drop
                cost = abs(z - target * self.h) + 0.0006 * math.degrees(t0) + 0.0003 * abs(hd + 75)
                if best is None or cost < best[0]: best = (cost, th, z, math.degrees(t0), hd)
        _, th, z, t0, hd = best
        return th, z, t0, hd

    def front_pose(self, p, cov, th, sigma, drop):
        """the neck chain and head posed by the linear blend of the bones (th, sigma as chain()), then the front's sinking. Returns p, cov"""
        J, ang, m = self.chain(th, sigma)
        dev = p.device
        rest = [torch.tensor(r, dtype=torch.float32, device=dev) for r in self.Jr]
        out = p * self.w[0][:, None]; phi = torch.zeros(len(p), device=dev)
        for k in (1, 2, 3):
            j = k - 1; a = ang[j]; c, s = math.cos(a), math.sin(a)
            du = p[:, 0] - rest[j][0]; dz = p[:, 2] - rest[j][1]
            if k < 3:  # the neck lengthens along the bone's own axis
                ax = self.dirs[j]; t = du * float(ax[0]) + dz * float(ax[1])
                du = du + sigma * t * float(ax[0]); dz = dz + sigma * t * float(ax[1])
            nu = c * du + s * dz; nz = -s * du + c * dz
            pos = torch.stack([nu + float(J[j][0]), p[:, 1], nz + float(J[j][1])], 1)
            out = out + pos * self.w[k][:, None]; phi = phi + self.w[k] * a
        R = rot_lateral(phi); cov2 = R @ cov @ R.transpose(1, 2)
        # where the bend stretches the skin (the cut zones) the splats grow, so the surface stays closed
        d = [abs(ang[0]), abs(ang[1] - ang[0]), abs(ang[2] - ang[1])]
        infl = 1 + INFLATE * sum(4 * self.s[k] * (1 - self.s[k]) * d[k] for k in range(3)); infl = infl.clamp(max=2.4)
        cov2 = cov2 * (infl * infl)[:, None, None]
        if drop:
            u = out[:, 0]; k = smooth((u - self.u_back) / (self.u_front - self.u_back)); z0 = out[:, 2]
            out = out.clone(); out[:, 2] = z0 - drop * k * torch.clamp(z0 / self.belly, max=1.0)
            sq = torch.where(z0 < self.belly, 1 - drop * k / self.belly, torch.ones_like(z0))  # the front legs squash
            S = torch.eye(3, device=dev)[None].repeat(len(p), 1, 1); S[:, 2, 2] = sq
            cov2 = S @ cov2 @ S.transpose(1, 2)
        return out, cov2

    # ---------------------------------------------------------------- legs and tail
    def legs_tail(self, p, cov, legs=(0., 0., 0., 0.), lift=(0., 0., 0., 0.), bob=0.0, tail=0.0):
        dev = p.device
        if tail:
            R = rot_long(self.w_tail * tail); q = p.clone(); q[:, 2] -= self.tail_z; q = (R @ q.unsqueeze(2)).squeeze(2); q[:, 2] += self.tail_z
            p, cov = q, R @ cov @ R.transpose(1, 2)
        if any(legs) or any(lift):
            ang = torch.zeros(len(p), device=dev); pu = torch.zeros(len(p), device=dev); lf = torch.zeros(len(p), device=dev)
            for (fr, lft), a, l in zip(((True, True), (True, False), (False, True), (False, False)), legs, lift):
                m = (self.front == fr) & (self.left == lft); ang[m] = -a; pu[m] = self.u_front if fr else self.u_back; lf[m] = l
            ang = ang * self.w_leg
            R = rot_lateral(ang); q = p.clone(); q[:, 0] -= pu; q[:, 2] -= self.pivot_z
            q = (R @ q.unsqueeze(2)).squeeze(2); q[:, 0] += pu; q[:, 2] += self.pivot_z
            q[:, 2] += lf * self.h * self.w_foot  # the foot lifts as the leg swings forward
            p, cov = q, R @ cov @ R.transpose(1, 2)
        if bob:
            p = p.clone(); p[:, 2] += bob * self.h
        return p, cov
