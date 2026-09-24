/* One component renders any frame of the film: pure frame state → posed 3D world → graphics. */
import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, delayRender, continueRender } from 'remotion';
import * as THREE from 'three';
import { evaluate, Film as FilmT } from '../film/timeline';
import { getWorld } from '../three/world';
import { PALETTE, SIZE } from '../film/theme';
import { OVERLAYS, Caption } from './overlays';

const GLOW_BOOST = 3.2;

export const FilmView: React.FC<{ film: FilmT; offset?: number; captions?: boolean; mix?: string | null }> = ({ film, offset = 0, captions = false, mix }) => {
  const frame = useCurrentFrame() + offset;
  const [fontHandle] = useState(() => delayRender('fonts'));
  useEffect(() => { (document as any).fonts.ready.then(() => continueRender(fontHandle)); }, [fontHandle]);
  const fs = evaluate(film, frame);
  // Pose the world for this frame (deterministic; safe to do during render).
  const world = getWorld(SIZE.w, SIZE.h), eng = world.useEngine(fs.shot.arch);
  eng.update(fs.engine as any);
  // glows are HDR in the film (they feed the bloom); the shared engine keeps app-friendly 0..1 emissive levels
  for (const [, Pp] of eng.parts) for (const m of Pp.mats as Set<any>) if (m.emissive) m.emissive.multiplyScalar(GLOW_BOOST);
  const c = fs.cam, d = Math.PI / 180;
  const tg = c.target ? new THREE.Vector3(c.target[0], c.target[1], c.target[2])
    : world.resolve(c.ta, new THREE.Vector3()).lerp(world.resolve(c.tb, new THREE.Vector3()), c.u);
  const pos = new THREE.Vector3(tg.x + c.rad * Math.sin(c.pol * d) * Math.sin(c.az * d), tg.y + c.rad * Math.cos(c.pol * d), tg.z + c.rad * Math.sin(c.pol * d) * Math.cos(c.az * d));
  // focus distance: blend the focus subjects of the surrounding keys (anchor / point / plain distance; default = target)
  const fdist = (f: any) => typeof f === 'number' ? f : f == null ? pos.distanceTo(tg) : pos.distanceTo(world.resolve(f, new THREE.Vector3()));
  const focus = fdist(c.fa) + (fdist(c.fb) - fdist(c.fa)) * c.u;
  world.setPost({ exposure: fs.exposure, dof: c.dof, focus, ao: fs.look.ao, bloom: fs.look.bloom, key: fs.look.key, fill: fs.look.fill, rim: fs.look.rim });
  world.setCamera({ pos, target: tg, fov: c.fov }); world.setFloor(fs.floorDrop);
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = host.current!; if (world.renderer.domElement.parentElement !== el) el.appendChild(world.renderer.domElement); world.render(); });
  return <AbsoluteFill style={{ background: PALETTE.bg0, overflow: 'hidden' }}>
    <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    {fs.overlays.map((o, i) => { const C = OVERLAYS[o.ov.type]; return C ? <C key={i} o={o} fs={fs} world={world} /> : null; })}
    {captions && <Caption fs={fs} />}
    <AbsoluteFill style={{ background: '#000', opacity: fs.dip }} />
    {mix && <Audio src={staticFile(mix)} startFrom={offset} />}
  </AbsoluteFill>;
};
