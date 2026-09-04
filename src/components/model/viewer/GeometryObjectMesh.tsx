import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from "three";
import type { ModelGeometryObject } from "@/types/geometry";
import {
  loadPositionsBuffer,
  materialColorForObject,
  matrixFrom3mfTransform,
} from "@/lib/viewerMath";

type GeometryObjectMeshProps = {
  object: ModelGeometryObject;
  fallbackColor: string;
  centerToOrigin?: boolean;
  onReady?: () => void;
};

export function GeometryObjectMesh({
  object,
  fallbackColor,
  centerToOrigin = false,
  onReady,
}: GeometryObjectMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  const transform = useMemo(() => {
    const matrix = object.transform && object.transform.length >= 12
      ? matrixFrom3mfTransform(object.transform)
      : new Matrix4();

    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    matrix.decompose(position, quaternion, scale);
    return { position, quaternion, scale };
  }, [object.transform]);

  const color = materialColorForObject(object, fallbackColor);

  useEffect(() => {
    let disposed = false;
    let current: BufferGeometry | null = null;

    void loadPositionsBuffer(object.positionsPath)
      .then((positions) => {
        if (disposed) {
          return;
        }
        const next = new BufferGeometry();
        next.setAttribute("position", new BufferAttribute(positions, 3));
        if (centerToOrigin) {
          next.computeBoundingBox();
          const box = next.boundingBox;
          if (box) {
            const center = box.getCenter(new Vector3());
            next.translate(-center.x, -center.y, -box.min.z);
          }
        }
        next.computeVertexNormals();
        current = next;
        setGeometry(next);
        onReady?.();
      })
      .catch(() => {
        if (!disposed) {
          setGeometry(null);
        }
      });

    return () => {
      disposed = true;
      current?.dispose();
      setGeometry((existing) => {
        existing?.dispose();
        return null;
      });
    };
  }, [centerToOrigin, object.positionsPath, onReady]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    mesh.position.copy(transform.position);
    mesh.quaternion.copy(transform.quaternion);
    mesh.scale.copy(transform.scale);
  }, [transform]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
        side={DoubleSide}
      />
    </mesh>
  );
}
