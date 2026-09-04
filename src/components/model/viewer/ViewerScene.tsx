import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Group, Vector3 } from "three";
import type { OrbitControlsHandle } from "@/components/model/viewer/orbitControlsRef";
import type { ModelGeometryResponse } from "@/types/geometry";
import { BuildPlate } from "@/components/model/viewer/BuildPlate";
import { GeometryObjectMesh } from "@/components/model/viewer/GeometryObjectMesh";

type ViewerSceneProps = {
  geometry: ModelGeometryResponse;
  isDark: boolean;
  fitToken: number;
  controlsRef: React.RefObject<OrbitControlsHandle | null>;
};

export function ViewerScene({
  geometry,
  isDark,
  fitToken,
  controlsRef,
}: ViewerSceneProps) {
  const rootRef = useRef<Group>(null);
  const { camera, size } = useThree();
  const [readyCount, setReadyCount] = useState(0);

  const modelColor = isDark ? "#9aa3b2" : "#6b7280";
  const plateColor = isDark ? "#2a2c31" : "#e8eaed";
  const gridColor = isDark ? "#3a3d45" : "#c5c9d0";
  const centerToOrigin = geometry.format === "stl";

  const onObjectReady = useCallback(() => {
    setReadyCount((value) => value + 1);
  }, []);

  useLayoutEffect(() => {
    setReadyCount(0);
  }, [geometry]);

  useLayoutEffect(() => {
    if (readyCount < geometry.objects.length) {
      return;
    }

    const root = rootRef.current;
    if (!root) {
      return;
    }

    root.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) {
      return;
    }

    const center = box.getCenter(new Vector3());
    const sizeVec = box.getSize(new Vector3());
    const radius = Math.max(sizeVec.length() * 0.5, 1);
    const aspect = size.width / Math.max(size.height, 1);
    const perspectiveFov =
      "fov" in camera && typeof camera.fov === "number" ? camera.fov : 45;
    const fov = (perspectiveFov * Math.PI) / 180;
    const fitHeight = radius / Math.sin(fov / 2);
    const fitWidth = fitHeight / Math.max(aspect, 0.0001);
    const distance = Math.max(fitHeight, fitWidth) * 1.4;

    const direction = new Vector3(0.9, 0.75, 1).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 250, 0.01);
    camera.far = Math.max(distance * 50, 1000);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.minDistance = Math.max(radius * 0.15, 1);
      controls.maxDistance = Math.max(distance * 6, 100);
      controls.update();
    }
  }, [
    camera,
    controlsRef,
    fitToken,
    geometry.objects.length,
    readyCount,
    size.height,
    size.width,
  ]);

  return (
    <group ref={rootRef}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {geometry.format === "3mf" ? (
          <BuildPlate
            widthMm={geometry.bedWidthMm}
            depthMm={geometry.bedDepthMm}
            color={plateColor}
            gridColor={gridColor}
          />
        ) : (
          <gridHelper args={[220, 22, gridColor, gridColor]} rotation={[Math.PI / 2, 0, 0]} />
        )}
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
  );
}
