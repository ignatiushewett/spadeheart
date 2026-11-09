// Chunk worker: generates voxels and builds meshes off the main thread.
import { makeGenerator } from './gen.js';
import { makeMesher } from './mesher.js';

let gen = null, mesh = null;

self.onmessage = (e) => {
  const m = e.data;
  switch (m.t) {
    case 'init':
      gen = makeGenerator(m.layout);
      mesh = makeMesher(m.layout);
      self.postMessage({ t: 'ready' });
      break;
    case 'gen': {
      const data = gen(m.cx, m.cy, m.cz);
      self.postMessage({ t: 'gen', cx: m.cx, cy: m.cy, cz: m.cz, data }, data ? [data.buffer] : []);
      break;
    }
    case 'mesh': {
      const r = mesh(m.data, m.cx, m.cy, m.cz, m.lod);
      self.postMessage({ t: 'mesh', cx: m.cx, cy: m.cy, cz: m.cz, ver: m.ver, lod: m.lod, verts: r.verts, oq: r.opaqueQuads, gq: r.glassQuads }, [r.verts.buffer]);
      break;
    }
  }
};
