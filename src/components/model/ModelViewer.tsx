import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControlsHandle } from "@/components/model/viewer/orbitControlsRef";
import { ViewerScene } from "@/components/model/viewer/ViewerScene";
import { useModelGeometry } from "@/hooks/useModelGeometry";
import { useTheme } from "@/hooks/useTheme";
import type { LibraryFile } from "@/types/library";

type ModelViewerProps = {
  file: LibraryFile;
  selectedPlateId: string | null;
  cameraReset: number;
};

export function ModelViewer({
  file,
  selectedPlateId,
  cameraReset,
}: ModelViewerProps) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";
  const [fitToken, setFitToken] = useState(0);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);

  const extension = file.extension.toLowerCase();
  const supported = extension === "stl" || extension === "3mf";
  const { state } = useModelGeometry(
    supported ? file : null,
    extension === "3mf" ? selectedPlateId : null,
  );

  useEffect(() => {
    if (state.status === "ready") {
      setFitToken((value) => value + 1);
    }
  }, [state.status, state.status === "ready" ? state.data.plateId : null]);

  useEffect(() => {
    if (cameraReset > 0) {
      setFitToken((value) => value + 1);
    }
  }, [cameraReset]);

  if (!supported) {
    return (
      <div className="model-viewer__overlay">
        <p>3D preview unavailable for this format.</p>
      </div>
    );
  }

  const background = isDark ? "#1c1c1e" : "#f3f4f6";

  return (
    <div className="model-viewer__canvas-wrap">
      {state.status === "loading" || state.status === "idle" ? (
        <div className="model-viewer__overlay">
          <p>Loading 3D preview…</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="model-viewer__overlay">
          <p>3D preview unavailable</p>
          <p className="model-viewer__overlay-detail">{state.message}</p>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <Canvas
          key={`${file.libraryFileId}-${resolved}`}
          className="model-viewer__canvas"
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          camera={{ fov: 40, near: 0.1, far: 5000, position: [200, 160, 220] }}
          onCreated={({ gl }) => {
            gl.setClearColor(background);
          }}
        >
          <color attach="background" args={[background]} />
          <ambientLight intensity={isDark ? 0.55 : 0.7} />
          <directionalLight
            position={[180, 240, 120]}
            intensity={isDark ? 0.85 : 1.05}
          />
          <directionalLight
            position={[-140, 80, -100]}
            intensity={isDark ? 0.25 : 0.35}
          />
          <Suspense fallback={null}>
            <ViewerScene
              geometry={state.data}
              isDark={isDark}
              fitToken={fitToken}
              controlsRef={controlsRef}
            />
          </Suspense>
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.12}
            rotateSpeed={0.85}
            zoomSpeed={1.15}
            panSpeed={0.9}
            minPolarAngle={0}
            maxPolarAngle={Math.PI}
          />
        </Canvas>
      ) : null}
    </div>
  );
}
