import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, Mesh } from "three";
import type { OrbitControlsHandle } from "@/components/model/viewer/orbitControlsRef";
import type { ModelGeometryResponse } from "@/types/geometry";
import { BuildPlate } from "@/components/model/viewer/BuildPlate";
import { GeometryObjectMesh } from "@/components/model/viewer/GeometryObjectMesh";
import { computeCameraFit } from "@/lib/viewerMath";

type ViewerSceneProps = {
  geometry: ModelGeometryResponse;
  isDark: boolean;
  fitToken: number;
  controlsRef: React.RefObject<OrbitControlsHandle | null>;
};

function collectModelsBounds(models: Group): Box3 {
  models.updateWorldMatrix(true, true);
  models.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      mesh.updateWorldMatrix(true, false);
    }
  });
  return new Box3().setFromObject(models, true);
}

export function ViewerScene({
  geometry,
  isDark,
  fitToken,
  controlsRef,
}: ViewerSceneProps) {
  const modelsRef = useRef<Group>(null);
  const plateRef = useRef<Group>(null);
  const pendingFitRef = useRef(true);
  const fitAttemptsRef = useRef(0);
  const { camera, size } = useThree();
  const [readyCount, setReadyCount] = useState(0);

  const modelColor = isDark ? "#9aa3b2" : "#6b7280";
  const plateColor = isDark ? "#2a2c31" : "#e8eaed";
  const gridColor = isDark ? "#3a3d45" : "#c5c9d0";
  const centerToOrigin = geometry.format === "stl";
  const objectCount = geometry.objects.length;

  const onObjectReady = useCallback(() => {
    setReadyCount((value) => value + 1);
  }, []);

  useLayoutEffect(() => {
    setReadyCount(0);
  }, [geometry]);

  useLayoutEffect(() => {
    pendingFitRef.current = true;
    fitAttemptsRef.current = 0;
  }, [fitToken, geometry, size.height, size.width]);

  const applyFit = useCallback(
    (box: Box3): boolean => {
      if (box.isEmpty()) {
        return false;
      }

      const fov =
        "fov" in camera && typeof camera.fov === "number" ? camera.fov : 40;
      const aspect = size.width / Math.max(size.height, 1);
      const fit = computeCameraFit(box, fov, aspect);
      if (!fit) {
        return false;
      }

      camera.position.copy(fit.position);
      camera.near = fit.near;
      camera.far = fit.far;
      camera.lookAt(fit.target);
      camera.updateProjectionMatrix();

      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(fit.target);
        controls.minDistance = fit.minDistance;
        controls.maxDistance = fit.maxDistance;
        controls.update();
      }

      return true;
    },
    [camera, controlsRef, size.height, size.width],
  );

  useFrame(() => {
    if (!pendingFitRef.current) {
      return;
    }

    // Wait until every expected mesh has signaled ready.
    if (readyCount < objectCount) {
      return;
    }

    const models = modelsRef.current;
    if (!models) {
      return;
    }

    fitAttemptsRef.current += 1;
    const modelBox = collectModelsBounds(models);

    if (!modelBox.isEmpty()) {
      if (applyFit(modelBox)) {
        pendingFitRef.current = false;
      }
      return;
    }

    // Only fall back to the plate when the plate truly has no objects.
    if (objectCount === 0) {
      const plate = plateRef.current;
      if (!plate) {
        return;
      }
      plate.updateWorldMatrix(true, true);
      const plateBox = new Box3().setFromObject(plate, true);
      if (applyFit(plateBox)) {
        pendingFitRef.current = false;
      }
      return;
    }

    // Meshes reported ready but bounds are not valid yet — retry briefly.
    if (fitAttemptsRef.current > 120) {
      pendingFitRef.current = false;
    }
  });

  return (
    <group>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={plateRef}>
          {geometry.format === "3mf" ? (
            <BuildPlate
              widthMm={geometry.bedWidthMm}
              depthMm={geometry.bedDepthMm}
              color={plateColor}
              gridColor={gridColor}
            />
          ) : (
            <gridHelper
              args={[220, 22, gridColor, gridColor]}
              rotation={[Math.PI / 2, 0, 0]}
            />
          )}
        </group>

        <group ref={modelsRef}>
          {geometry.objects.map((object) => (
            <GeometryObjectMesh
              key={`${object.id}-${object.positionsPath}`}
              object={object}
              fallbackColor={modelColor}
              centerToOrigin={centerToOrigin}
              onReady={onObjectReady}
            />
          ))}
        </group>
      </group>
    </group>
  );
}
