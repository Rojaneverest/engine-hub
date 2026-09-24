import React from 'react';
import { Composition } from 'remotion';
import manifest from '../public/audio/manifest.json';
import { buildFilm } from './film/timeline';
import { PILOT } from './film/storyboard.pilot';
import { FilmView } from './components/Film';
import { FPS, SIZE } from './film/theme';

const film = buildFilm(PILOT, manifest as any);
const mix = (manifest as any).mix ?? null;

export const Root: React.FC = () => <>
  <Composition id="Pilot" component={FilmView as any} durationInFrames={film.frames} fps={FPS} width={SIZE.w} height={SIZE.h}
    defaultProps={{ film, offset: 0, captions: false, mix }} />
  <Composition id="Pilot-captioned" component={FilmView as any} durationInFrames={film.frames} fps={FPS} width={SIZE.w} height={SIZE.h}
    defaultProps={{ film, offset: 0, captions: true, mix }} />
  {film.shots.map(s => <Composition key={s.id} id={`shot-${s.id}`} component={FilmView as any}
    durationInFrames={Math.max(1, Math.round((s.start + s.dur) * FPS) - Math.round(s.start * FPS))} fps={FPS} width={SIZE.w} height={SIZE.h}
    defaultProps={{ film, offset: Math.round(s.start * FPS), captions: false, mix }} />)}
</>;
