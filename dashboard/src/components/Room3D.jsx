import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, ContactShadows, Edges } from '@react-three/drei';

import { ROOM, horizonOf, layoutToWorld } from './layout.js';

const C = {
  floor: '#f6f8f9',
  wall: '#c7d0da',
  board: '#2c3d63',
  chair: '#1e7a4c',
  chairEmpty: '#8fbfa5',
  desk: '#b98a55',
  deskTop: '#d8b688',
  person: '#5a3fb0',
  head: '#3e2a85',
  screen: '#14213d',
  heat: '#e07a10',
  scan: '#5a3fb0',
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------- pieces */

/** Live mode: glide toward the latest tracked position instead of jumping. */
function Mover({ to, children }) {
  const ref = useRef();
  const instant = useMemo(prefersReducedMotion, []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const k = instant ? 1 : 1 - Math.exp(-dt * 8);
    ref.current.position.x += (to[0] - ref.current.position.x) * k;
    ref.current.position.z += (to[1] - ref.current.position.z) * k;
  });
  return <group ref={ref} position={[to[0], 0, to[1]]}>{children}</group>;
}

function DropIn({ delay = 0, children, ...props }) {
  const ref = useRef();
  const start = useRef(null);
  const instant = useMemo(prefersReducedMotion, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (instant) { ref.current.scale.setScalar(1); ref.current.position.y = 0; return; }
    if (start.current === null) start.current = clock.elapsedTime;
    const t = THREE.MathUtils.clamp((clock.elapsedTime - start.current - delay) / 0.55, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    ref.current.scale.setScalar(Math.max(0.0001, e));
    ref.current.position.y = (1 - e) * 1.2;
  });
  return (
    <group {...props}>
      <group ref={ref} scale={0.0001}>{children}</group>
    </group>
  );
}

function Chair({ occupied }) {
  const col = occupied ? C.chair : C.chairEmpty;
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.5, 0.06, 0.5]} /><meshStandardMaterial color={col} /></mesh>
      <mesh position={[0, 0.78, 0.23]} castShadow><boxGeometry args={[0.5, 0.6, 0.06]} /><meshStandardMaterial color={col} /></mesh>
      {[[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]}><boxGeometry args={[0.05, 0.44, 0.05]} /><meshStandardMaterial color="#4a5568" /></mesh>
      ))}
    </group>
  );
}

function Desk({ size = 2 }) {
  return (
    <group>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[size, 0.07, 0.7]} />
        <meshStandardMaterial color={C.deskTop} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (size / 2 - 0.08), 0.37, 0]}>
          <boxGeometry args={[0.06, 0.74, 0.6]} />
          <meshStandardMaterial color={C.desk} />
        </mesh>
      ))}
    </group>
  );
}

function Person({ seated }) {
  const base = seated ? 0.48 : 0;
  const body = seated ? 0.62 : 1.05;
  return (
    <group position={[0, base, seated ? 0.02 : 0]}>
      <mesh position={[0, body / 2 + 0.1, 0]} castShadow>
        <capsuleGeometry args={[0.2, body - 0.2, 6, 14]} />
        <meshStandardMaterial color={C.person} roughness={0.55} />
      </mesh>
      <mesh position={[0, body + 0.33, 0]} castShadow>
        <sphereGeometry args={[0.17, 20, 16]} />
        <meshStandardMaterial color={C.head} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Screen({ onTable, laptop }) {
  const y = onTable ? 0.78 : 0;
  return (
    <group position={[0, y, -0.12]}>
      <mesh position={[0, laptop ? 0.13 : 0.25, 0]} castShadow>
        <boxGeometry args={[laptop ? 0.42 : 0.6, laptop ? 0.26 : 0.38, 0.04]} />
        <meshStandardMaterial color={C.screen} />
      </mesh>
      {!laptop && <mesh position={[0, 0.05, 0]}><boxGeometry args={[0.08, 0.1, 0.08]} /><meshStandardMaterial color="#4a5568" /></mesh>}
    </group>
  );
}

function Item({ it, occupied }) {
  switch (it.category) {
    case 'chair': return <Chair occupied={occupied} />;
    case 'table':
    case 'bench': return <Desk size={it.size} />;
    case 'person': return <Person seated={it.seated} />;
    case 'monitor': return <Screen onTable={it.onTable} />;
    case 'laptop': return <Screen onTable={it.onTable} laptop />;
    default:
      return (
        <mesh position={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.24, 0.24, 0.24]} />
          <meshStandardMaterial color="#76829a" />
        </mesh>
      );
  }
}

function Shell() {
  const { W, D, H } = ROOM;
  return (
    <group>
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[W, 0.2, D]} />
        <meshStandardMaterial color={C.floor} />
        <Edges color="#a9b4c0" />
      </mesh>
      {/* tile lines */}
      <gridHelper args={[W, 12, '#dde3e9', '#dde3e9']} position={[0, 0.002, 0]} scale={[1, 1, D / W]} />
      {/* back + left walls, cut low like a model */}
      <mesh position={[0, H / 2, -D / 2 - 0.06]} receiveShadow>
        <boxGeometry args={[W, H, 0.12]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      <mesh position={[-W / 2 - 0.06, H / 2, 0]} receiveShadow>
        <boxGeometry args={[0.12, H, D + 0.24]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      {/* blackboard + door */}
      <mesh position={[-0.5, 1.45, -D / 2 + 0.01]}>
        <boxGeometry args={[4.2, 1.2, 0.04]} />
        <meshStandardMaterial color={C.board} />
      </mesh>
      <mesh position={[-W / 2 + 0.01, 1.05, 2.6]}>
        <boxGeometry args={[0.04, 2.1, 1.0]} />
        <meshStandardMaterial color="#9aa6b4" />
      </mesh>
    </group>
  );
}

function Heatmap({ heatmap, items }) {
  const ref = useRef();
  const cells = useMemo(() => {
    if (!heatmap?.values?.length) return [];
    const { cols, rows, values } = heatmap;
    const pts = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = values[r * cols + c];
        const y = (r + 0.5) / rows;
        if (v > 0.04) pts.push({ category: 'heat', x: (c + 0.5) / cols, y, v });
      }
    }
    // share the same perspective mapping as the detections
    const horizon = horizonOf(items || []);
    return layoutToWorld(pts.filter((p) => p.y > horizon), horizon);
  }, [heatmap, items]);

  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const floor = new THREE.Color(C.floor);
    const hot = new THREE.Color(C.heat);
    cells.forEach((cell, i) => {
      m.makeTranslation(cell.pos[0], 0.006, cell.pos[1]);
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, col.copy(floor).lerp(hot, 0.25 + 0.75 * cell.v));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [cells]);

  if (!cells.length) return null;
  return (
    <instancedMesh ref={ref} args={[null, null, cells.length]}>
      <boxGeometry args={[0.5, 0.004, 0.5]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}

function ScanPlane() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.elapsedTime * 0.35) % 1;
    ref.current.position.z = -ROOM.D / 2 + t * ROOM.D;
  });
  return (
    <mesh ref={ref} position={[0, ROOM.H / 2, 0]}>
      <boxGeometry args={[ROOM.W, ROOM.H, 0.05]} />
      <meshBasicMaterial color={C.scan} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

function FitCamera({ padding = 0.82 }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const span = Math.hypot(ROOM.W, ROOM.D) * 0.8;
    camera.zoom = (Math.min(size.width, size.height * 1.35) / span) * padding;
    camera.updateProjectionMatrix();
  }, [camera, size, padding]);
  return null;
}

/* -------------------------------------------------------------------- scene */

export default function Room3D({ items = [], heatmap = null, rawItems = null, scanning = false, autoRotate = true, showHeat = true, live = false, label }) {
  const reduced = useMemo(prefersReducedMotion, []);
  const occupiedChairs = useMemo(() => {
    const people = items.filter((i) => i.category === 'person' && i.seated);
    return new Set(items.map((it, idx) => (it.category === 'chair' && people.some((p) => p.pos[0] === it.pos[0] && p.pos[1] === it.pos[1]) ? idx : -1)));
  }, [items]);

  return (
    <Canvas shadows dpr={[1, 2]} aria-label={label || '3D model of the classroom'} role="img">
      <OrthographicCamera makeDefault position={[11, 10, 13]} near={-50} far={100} />
      <FitCamera />
      <color attach="background" args={['#d5dce3']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <hemisphereLight args={['#ffffff', '#b8c2cc', 0.35]} />

      <Shell />
      {showHeat && heatmap && <Heatmap heatmap={heatmap} items={rawItems} />}
      {live && items.map((it, i) => (
        <Mover key={it.key || `${it.category}-${i}`} to={it.pos}>
          <Item it={it} occupied={occupiedChairs.has(i)} />
        </Mover>
      ))}
      {!live && items.map((it, i) => (
        <DropIn key={`${it.category}-${i}-${it.pos[0]}-${it.pos[1]}`} delay={0.15 + i * 0.025} position={[it.pos[0], 0, it.pos[1]]}>
          <Item it={it} occupied={occupiedChairs.has(i)} />
        </DropIn>
      ))}
      {scanning && <ScanPlane />}
      <ContactShadows position={[0, 0.005, 0]} scale={14} blur={2.4} opacity={0.25} far={3} />
      <OrbitControls
        target={[0, 0.6, 0]}
        enablePan={false}
        minZoom={15}
        maxZoom={140}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.25}
        autoRotate={autoRotate && !reduced}
        autoRotateSpeed={0.45}
        enableDamping
      />
    </Canvas>
  );
}
